# Contract: the sync pipeline's step boundaries

The Step Functions state machine `crm-sync`, per architecture-constitution.md §2.3. This records the input/output shape each handler owns, so `espeon` and `machamp`'s task groups have a clean seam (per `agent-design.md`'s convergence: `BuildIndex` is a plain, network-free Lambda — it only ever receives an already-verified batch, never fetches anything itself).

## `Plan`

**Input**: `{ manifestCidHint?: CID }` (from EventBridge discovery, or a pinned SSM value)

**Output**:
```text
PlanResult = {
  manifestCid: CID              // the authoritative CID for this run (SSM-pinned, or the verified hint)
  profiles: ProfileRef[]        // from the manifest, digest-checked against the vendored packages/oracle-* copy
  costEstimate: { predictedSpendUsd: number, predictedDocCount: integer, predictedBytes: integer }
}
```

**Holds** (does not proceed to `FetchPart`) when: a `profiles[].sha256` digest mismatches the vendored copy; `costEstimate` exceeds $1.00 / 1,000,000 docs (600,000 until 2026-10-25, raised for Run 3) / 2 GB; the candidate run is a lineage fork or has an older `finishedAt` than the currently promoted run.

## `FetchPart` (machamp)

**Input**: one manifest part per Map iteration, concurrency 2–3

**Output**: `{ status: "verified", partPath: string, sha256: string, s3Key: string, written: boolean }` (the verified bytes are in S3 at `s3Key`, never in the task result: Step Functions rejects results over 256 KB) — or routes to the DLQ after 5 retries with backoff+jitter

**Owns**: the gateway order (CloudFront → Filebase → Pinata, ADR-02), the ≤30 req/min token bucket per gateway, the content-addressed S3 write (`sha256(manifestCid + partPath)`, `If-None-Match`).

## `BuildIndex` (espeon)

**Input**: the full set of this run's verified parts (from S3, already sha256-confirmed — `BuildIndex` does not re-fetch or re-verify network bytes)

**Output**: `crm_property`/`crm_permit` Parquet files under `index/{manifestCid}/`, each row Zod-validated against `packages/index-schema` before being written, with `sourceManifestCid` set on every row.

**Must not**: make any network call to Task A or any gateway (that boundary belongs entirely to `FetchPart`); re-derive `status_class`/`open_days`/roof age itself (must call vendored `query-core`, ADR-07).

## `Validate` (espeon)

**Input**: the Parquet written by `BuildIndex`, plus the manifest's `coverage.parcels_published`

**Output**: `index_meta` record (see data-model.md) with `status: "Validated" | "Held"`, `reconcileDiff`, and `heldReason` when held.

**Rule**: 0 rows without `sourceManifestCid`; a drop > 5% from the previously promoted run holds, never silently promotes (constitution P0-3, edge case in spec.md).

## `Promote` (espeon)

**Input**: an `index_meta` record with `status: "Validated"`

**Output**: `META#index.current` flipped atomically via a DynamoDB conditional write guarded on the previous value.

**Must not**: flip the pointer for a `Held` or partially-written run under any condition (constitution P0-3 — "no partial promotion" is absolute, not a best-effort).
