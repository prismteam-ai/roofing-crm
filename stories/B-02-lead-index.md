---
id: B-02
type: user-story
title: "Build the lead search index from Task A's published data"
parent: FEAT-B02
parts: [B-02]
vision: VIS-B
ard: ARD-B
eval_point: B2, B3, B6
priority: P1
moscow: Must
branch: 002-lead-index
spec: specs/002-lead-index/
depends_on: ["B-01 merged", "Task A A-02 (Data contract) done — vendored at commit 660f73c (docs/reuse-log.md), sha256 7af3bdf9...", "Task A A-11 (Publish + incremental runs): sample manifest CID bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i published and reachable (contract/v1/sample.parquet, verified 2026-10-23); the full-county run A-11 itself is not required to start this story (sample-first mode) — see docs/plan.md EXT-01"]
size_days: 1.5
agents:
  design: [alakazam, espeon, machamp]
  builder: espeon            # index: prototype to production
  builder_2: machamp         # batch job, cost gate, idempotency
  reviewers: [espeon, alakazam, machamp, porygon, donphan]
  verify: "index doc count = Oracle v_property count (checked by donphan through the Oracle MCP), ±documented difference"
skills: [build-local-rag-pocs, build-rag-systems, build-batch-workflows, unify-metrics, use-elephant-mcp, apply-engineering-guidelines]
ui: false
status: Done
gate: G7
qc_testability_signoff: true
created: 2026-10-23
reuses:
  - from: "Task A A-02 (Data contract)"
    paths: ["packages/contract (manifest and view-row Zod schemas)"]
  - from: "Task A A-11 (Publish + incremental runs)"
    paths: ["packages/query-core (views.sql, bindManifest(), QueryEngine)", "scripts/verify-manifest.ts"]
    note: "Vendored and pinned to a named Task A commit per architecture-constitution.md ADR-07, with a profiles[].sha256 digest guard; never re-implemented."
---

# B-02 Build the lead search index from Task A's published data

| Field | Value |
| --- | --- |
| Evaluation point | B2 (aged-roof leads), B3 (open/long-open permits), B6 (filtering + scale) — this story is the data foundation under all three |
| Demo line(s) | none directly (no UI); it is the data source behind D-1, D-3, D-4 |
| Agents | design `alakazam`, `espeon`, `machamp` · builder `espeon` (index) + `machamp` (batch) · reviewers `espeon`, `alakazam`, `machamp`, `porygon`, `donphan` · verify index count vs. Oracle (from [AGENT-MAP.md](../../assessment-guide/AGENT-MAP.md) §5) |
| Depends on | B-01 merged; Task A A-02 frozen; Task A A-11 published (build against `contract/v1/sample.parquet` until then) |
| Size | 1.5 days |
| Branch | `002-lead-index`, merged into `feature/roofing-crm` |

## Context

Every later story — map search, leads, the agent — reads this index, never Task A's data directly. `espeon`'s discipline (a local query-only prototype before any AWS resource) catches wrong assumptions about Task A's contract cheaply, and `machamp`'s batch patterns (queue, DLQ, idempotency) keep the sync safe to re-run as Task A republishes. **Architecture note (G3, ADR-01):** the store is DuckDB over Parquet in the API Lambda, not an OpenSearch domain — `contract/v1` publishes no free text to embed yet, so OpenSearch would add cost without adding retrieval quality (recorded as an accepted deviation from `build-rag-systems`' production-store default; see `docs/architecture-constitution.md` §13).

## Description

As the **CRM** (on behalf of every later story), I want to **read Task A's published property and roofing-permit tables by CID, verify every byte, and build my own fast, queryable copy**, so that **map search, roof-age and permit filters, leads and the agent all run against one honest, reconciled index instead of fetching from Task A at request time**.

What will exist when done: a Step Functions sync job (`Plan → FetchPart → BuildIndex → Validate → Promote`) that reads a pinned manifest CID, downloads and CID-verifies `v_property` and `v_roofing_permit` parts, writes `crm_property`/`crm_permit` Parquet to a private S3 bucket, and atomically flips a `META#index` pointer only after validation passes.

**Independent test:** with no CRM UI built yet, run the sync against `contract/v1/sample.parquet`, then query the resulting Parquet directly with DuckDB and confirm row counts and `sourceManifestCid` are present. AC-1 and AC-4 are proven on the deployed Step Functions execution in `eu-north-1` (hosted runtime, Article I), not only in the local prototype.

## Acceptance Criteria

1. **AC-1** · **Given** Task A has published a frozen manifest CID for `contract/v1`, **When** the sync job runs, **Then** it fetches `v_property` and `v_roofing_permit` by CID (CloudFront copy first, verified by sha256 against the manifest, falling back to Filebase then Pinata), and writes `crm_property`/`crm_permit` Parquet carrying `sourceManifestCid`. ☑ testable — proven live, execution `-dbg14` (docs/evidence/B-02.md)
2. **AC-2 (scale)** · **Given** the full Travis County run manifest (not the sample), **When** the sync completes and `Validate` passes, **Then** the `crm_property` document count equals the manifest's `coverage.parcels_published` count exactly, or the difference is at most 0.1% of that count (the constitution's own index-fidelity NFR, `docs/architecture-constitution.md` §10) with every such difference written to `docs/evidence/B-02.md` and its reason stated, and `donphan` independently confirms the count through the Oracle MCP. A difference over 0.1% is a FAIL, not a documented pass. ☑ testable — mechanism proven in shape (reconcileDiff: 0, 14=14); full-county reconciliation and donphan's independent MCP cross-check are accepted exceptions at G7 Round 2 (docs/gates/G7-B-02-precheck.md), blocked on A-11 and Travis County's MCP publication respectively *(Round 1 decision, 2026-10-23: tightened from the G4-flagged "any difference, if documented" wording — no other AC changed.)*
3. **AC-3 (missing-data)** · **Given** a published property row has `roof_age_basis = "missing"` (for example, a parcel near Del Valle with no permit history), **When** the sync indexes it, **Then** the row is still written with its exact `missing` reason preserved — never a guessed or interpolated roof age. ☑ testable — proven (local prototype T012/T013 + unit tests)
4. **AC-4** · **Given** a sync run has already indexed manifest CID `X`, **When** the same CID is synced again, **Then** zero new S3 objects are created (content-addressed keys, `If-None-Match`), proving the run is idempotent. ☑ testable — proven live (26→26 S3 objects; execution-name collision guard, docs/evidence/B-02.md)

## Edge cases

- One part's downloaded bytes fail sha256 verification → that part's run is quarantined, an alarm fires, and the previous validated index keeps serving — no partial promotion.
- A new run's row count drops more than 5% from the previous run → promotion is held for operator review (lineage/cost gate), not silently promoted.

## Requirements

| REQ | Requirement | Traces to |
| --- | --- | --- |
| FR-001 | System MUST fetch Task A's published tables only by CID, verify every byte, and never call Task A's internal API or Query DB | AC-1 |
| FR-002 | System MUST record the index count against Oracle's published count and flag any undocumented mismatch | AC-2 |
| FR-003 | System MUST preserve every `missing` reason code from `contract/v1` rather than inventing a value | AC-3 |
| FR-004 | System MUST be safe to re-run against the same manifest CID with no duplicate writes | AC-4 |
| NFR-001 | Sync duration ≤ 5 min for an A-03-sized run, ≤ 30 min for the full county | AC-1; architecture-constitution.md §10; measured against AC-1's deployed run, recorded in `docs/evidence/B-02.md` |
| NFR-002 | Gateway politeness: concurrency 2, ≤ 30 requests/min per gateway, backoff + jitter | AC-1; architecture-constitution.md §10; observed on AC-1's `FetchPart` stage via the fault-injection test |

No `[NEEDS CLARIFICATION]` remaining.

## Prototype reference

Not applicable — this story has no UI (`ui: false`).

## Demo Script

Not a standalone demo line; its proof is `docs/evidence/B-02.md` (index count vs. Oracle count) and the data it feeds into B-03's and B-07's demo lines.

## Out of scope

- Any UI (map, list, leads) — those read this index in B-03 and B-07.
- Vector/semantic search over permit text (no embeddings in v1, per ADR-08 — `contract/v1` publishes no text to embed).
- Re-deriving `status_class`, `open_days` or roof-age rules — those come verbatim from vendored `query-core` (ADR-07).

## Evidence to capture

- `docs/evidence/B-02.md`: manifest CID used, row counts vs. Oracle, `donphan` MCP cross-check, idempotent-rerun proof.
- `testplans/B-02-test-cases.md` results, `docs/reviews/CR-B-02.md`.

---

## Gate G4: Story ready for planning

| # | Criterion | Status |
| --- | --- | --- |
| G4-1 | Front matter complete (parent FEAT, eval point, branch, priority, agents and skills from AGENT-MAP.md) | ☑ |
| G4-2 | "As a / I want / So that" stated, with an independent test | ☑ |
| G4-3 | Every AC is Given / When / Then, and its testable box is ticked | ☑ |
| G4-4 | One scale AC and one missing-data or error AC | ☑ |
| G4-5 | At least two edge cases | ☑ |
| G4-6 | Every requirement traces to an AC; NFRs have thresholds | ☑ |
| G4-7 | Prototype screen linked (UI stories) | N/A (ui: false) |
| G4-8 | Dependencies done, or stubbed with real sample data | ☑ — A-02 done (660f73c), A-03 published (sample CID), A-11 full-county pending (EXT-03), not required for sample-first mode |
| G4-9 | No `[NEEDS CLARIFICATION]` left | ☑ |
| G4-10 | AI pre-check (`developmentsupport-g4-precheck`): PASS | ☑ — docs/gates/G4-B-02-precheck.md; its one finding (vague dependency citations) fixed in this file's depends_on/reuses |

**Decision:** ☑ Ready · 2026-10-23 (ratified retroactively at G7 Round 2, alongside the G7 approval — see docs/gates/G7-B-02-precheck.md)
