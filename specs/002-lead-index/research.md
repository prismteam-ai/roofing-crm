# Phase 0 research: B-02 lead search index

No `NEEDS CLARIFICATION` markers were left in the Technical Context — every choice was already decided and recorded in `docs/architecture-constitution.md` (ratified at G3) or confirmed by the three design consults (`specs/002-lead-index/agent-design.md`). This file records those decisions in the Decision/Rationale/Alternatives format for traceability, rather than re-opening them.

## Decision: search/retrieval store

- **Decision**: DuckDB over Parquet inside the API Lambda. No OpenSearch domain.
- **Rationale**: `contract/v1` publishes no free text to embed; Task A measured DuckDB-in-Lambda at p95 200 ms (radius) / 95 ms (roof age) over 2.38M rows in `eu-north-1`; OpenSearch costs ~$31/month idle against a limited shared credit for no retrieval benefit yet.
- **Alternatives considered**: OpenSearch `t3.small.search` (rejected — cost without benefit); DuckDB-WASM in the browser (rejected — 15–42s p95, fails the SC-01 latency NFR by 5–14×).
- **Source**: ADR-01, `docs/architecture-constitution.md` §3, §13.

## Decision: fetch order and verification

- **Decision**: CloudFront CID copy first, then Filebase, then Pinata. Never ipfs.io/dweb.link. Every byte verified against its CID regardless of source.
- **Rationale**: Task A's CloudFront copy is confirmed public (OAC to a private bucket, CORS `*`, no signed URLs); fastest source; avoids Filebase's measured 429s after ~50–65 rapid requests.
- **Alternatives considered**: gateways-only with an IAM Deny on Task A's ARNs (espeon's original proposal) — superseded once the CloudFront copy's public status was confirmed; the IAM Deny is kept anyway as defense-in-depth (architecture-constitution.md §7).
- **Source**: ADR-02.

## Decision: vendoring Task A's derived-field logic

- **Decision**: Vendor (copy), never re-implement, `packages/query-core` and `packages/contract`, pinned to a named Task A commit, with a `profiles[].sha256` digest guard that holds the sync (not fails it outright) on drift.
- **Rationale**: Keeps one meaning of `status_class`, `open_days`, roof age and owner rules across both tasks; the digest guard makes drift loud instead of silent.
- **Alternatives considered**: re-deriving the rules in the CRM — rejected unanimously (all four original consults and all three B-02 design consults) because it would let the CRM and Task A disagree on what "open" or "aged" means.
- **Source**: ADR-07; confirmed independently by all three B-02 design consults with no dissent.

## Decision: run discovery, promotion and the cost gate

- **Decision**: A pinned manifest CID in SSM is the authority; `AUTO_PROMOTE` (default true, false during demo freeze) controls automatic promotion; a run is held on lineage fork, an older `finishedAt`, or exceeding $1.00 predicted spend / 600,000 documents / 2 GB.
- **Rationale**: Gives a reliable demo freeze while stopping a stale, forked, or unexpectedly large run from silently promoting.
- **Alternatives considered**: hourly polling with no pinned override (espeon's original) — merged with metagross's authority/freeze mechanism rather than chosen outright.
- **Refinement from this story's design consult**: machamp flags that the cost gate should size from the manifest's own declared byte size, not a live HEAD request, to avoid adding another throttled call to the gateway. Adopted — no counter-proposal from alakazam or espeon.
- **Source**: ADR-05; `agent-design.md` (machamp).

## Decision: idempotency mechanism

- **Decision**: Content-addressed S3 keys (`sha256(manifestCid + partPath)`), `If-None-Match` writes; the Step Functions execution name is the manifest CID, giving a free concurrent-execution guard at the orchestration layer in addition to the S3-level idempotency.
- **Rationale**: Proves AC-4 (zero new objects on a re-run of the same CID) at two independent layers — a bug in one is caught by the other.
- **Alternatives considered**: execution-name-only (rejected — doesn't protect against a retried/redriven Map item inside one execution); S3-key-only (rejected — doesn't stop a second concurrent execution of the same CID from starting).
- **Source**: architecture-constitution.md §8; `agent-design.md` (espeon, machamp).

## Decision: `BuildIndex`'s scope

- **Decision**: `BuildIndex` is a plain, network-free Lambda that treats `FetchPart`'s output as a sealed, already-verified batch. No Glue/PySpark at this scale.
- **Rationale**: Both espeon and machamp independently reached this conclusion without prompting — espeon rejects Glue as premature for a single-county, well-under-Lambda-limits dataset; machamp rejects any retry/pagination logic inside `BuildIndex` as duplicating `FetchPart`'s throttling boundary. No disagreement to resolve.
- **Alternatives considered**: Glue/PySpark `BuildIndex` (rejected by both builders as premature scale-up; reserved for a genuine full-county/multi-county future need per `build-batch-workflows`' staged-testing guidance).
- **Source**: `agent-design.md` (espeon, machamp).

## Open item carried forward (not blocking this plan)

- The published manifest carries no explicit contract-version field; the digest guard catches vendored-file drift but not a schema-compatible, semantically different manifest version. This is ARD-B §6's open item #2, already recorded as a follow-up for Task A, not a gap this story's plan must close. `Plan` holds the sync (never just warns) on any digest or fingerprint mismatch it can detect, per `agent-design.md` (alakazam).
