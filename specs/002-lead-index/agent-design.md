# Agent design consults: B-02 lead search index

Three read-only design consults (Sonnet), each given specs/002-lead-index/spec.md, stories/B-02-lead-index.md, docs/architecture-constitution.md and .specify/memory/constitution.md, plus skills build-local-rag-pocs, build-rag-systems, build-batch-workflows, unify-metrics, use-elephant-mcp and apply-engineering-guidelines. Answers recorded word for word below (constitution Article XIV).

## alakazam — retrieval/index design

Report for B-02 retrieval/index design (read-only design consult).

(1) Components/files: `packages/index-schema` (new) — Zod + TS for `crm_property`, `crm_permit`, `index_meta`, `Provenanced<T>`, shared reader/writer schema. `apps/sync` — Step Functions handlers `Plan → FetchPart → BuildIndex → Validate → Promote`, writes Parquet to `S3 crm-index`. `apps/api/src/adapters/duckDbParquet.ts` — implements the `LeadIndex` port (`searchProperties`, `searchPermits`, `getProperty`, `indexInfo`), the single query path shared by map search and the agent. `packages/oracle-contract`, `packages/oracle-views` — vendored, read-only copies of Task A's contract/query-core. `packages/domain` — `isAgedRoof`, `isLongOpen`, `bboxFor`, etc., imported by sync, api, and agent so no rule is defined twice.

(2) ADR realization in code: ADR-01 — no `RetrievalIndex`/OpenSearch client anywhere; the only query surface is DuckDB over `s3://crm-index/index/{manifestCid}/*.parquet`, downloaded to `/tmp` once per sandbox per manifest (a module-level cache keyed by manifestCid), not per request — this caching must be explicit in code since it's the whole cost/latency argument for rejecting OpenSearch. ADR-07 — `packages/oracle-contract`/`oracle-views` are literal copies with a file header naming the source Task A commit; the `Plan` step re-hashes vendored files against `profiles[].sha256` from the manifest before `FetchPart` runs and holds (not fails) on digest mismatch — this must be a real byte comparison in code, not a comment, or the "never silently re-implemented" guarantee is unverifiable.

(3) Risks: (a) DuckDB-in-Lambda cold-load cost is per-sandbox; if concurrency fans out across many cold sandboxes under load, the "index cold load ≤3s" NFR can be hit repeatedly — watch `IndexColdLoadMs` p95 across sandbox count, not just one warm path. (b) The digest guard only catches vendored-file drift, not a schema-compatible but semantically different manifest version — the "detect by schema fingerprint" fallback (ARD §6 open item) is a real gap until Task A adds an explicit contract field; a fingerprint mismatch should hold the sync, never just warn. (c) No built-in locking between a Promote write and a concurrent read — reads must resolve `META#index.manifestCid` first, then open only that completed folder, never a live/in-progress directory, to avoid reading a half-written Parquet set.

(4) Hosted verification: AC-1 and AC-4 must be proven on the deployed Step Functions execution in `eu-north-1`, not local — trigger the real state machine against the pinned manifest CID, diff S3 key counts before/after a second run of the same CID (expect zero new objects), and query the deployed API Lambda's DuckDB path for row counts and `sourceManifestCid` presence on every row. The local DuckDB/Parquet prototype is for `espeon`'s cheap-iteration discipline only, per `build-local-rag-pocs`/`build-rag-systems`'s local-to-production flow — it is never itself evidence.

Disagreement flag: none with espeon's or machamp's likely index shape or query API — ADR-01/ADR-07 are already PO-accepted and recorded, not up for re-argument. The one thing to watch at review time: if either proposes re-deriving `status_class`, `open_days`, or roof-age logic inline in the DuckDB query "for performance" instead of calling vendored `query-core` SQL/views verbatim, that violates ADR-07 and should be caught at code review, not reopened as a design question.

## espeon — prototype-to-production sync mechanics (primary builder)

Design consult for B-02 (lead search index), focus: prototype-to-production sync mechanics.

(1) Components/files:
- Local prototype (build-local-rag-pocs discipline, built before any AWS resource): `scripts/local-rag-poc/query.ts` — a query-only CLI (`inspect`, `query --cid`, `--paths`) that reads `contract/v1/sample.parquet` via vendored `query-core`'s `bindManifest()`/`QueryEngine`. Its job is to prove row shape, missing-reason preservation, and count semantics cheaply before touching AWS.
- Production pipeline: `infra/sync-stack.ts` (Step Functions `Plan → FetchPart → BuildIndex → Validate → Promote`), `lambda/plan.ts`, `lambda/fetch-part.ts` (CloudFront copy → Filebase → Pinata per ADR-02, sha256-verified against the manifest, never ipfs.io/dweb.link), `lambda/build-index.ts` (writes `crm_property`/`crm_permit` Parquet with content-addressed S3 keys), `lambda/validate.ts` (count vs `coverage.parcels_published`, ≤5% drop gate), `lambda/promote.ts` (atomic `META#index` pointer flip via a DynamoDB conditional write — never partial).

(2) ADR-01 / ADR-07 in the code:
- ADR-01: no OpenSearch client or index construct anywhere in the stack; DuckDB queries the Parquet files directly inside the API Lambda. No embedding call, no vector field.
- ADR-07: `packages/query-core` and the contract's manifest/view-row Zod schemas are imported from a vendored copy pinned to a named Task A commit SHA (submodule or pinned npm package), with a startup digest check against `profiles[].sha256` in the manifest — fail closed on drift. `FetchPart`/`BuildIndex` never reimplement CID verification, `status_class`, `open_days`, or roof-age derivation; those come verbatim from the vendored engine.

(3) Risks: sha256 mismatch mid-fetch (must quarantine the part, alarm, keep serving the last validated index — never partial promote); non-atomic promote under a concurrent/retried run (needs a run-id-guarded conditional write, not a bare overwrite); the full-county FetchPart cost/politeness gate (concurrency 2, ≤30 req/min, backoff+jitter — NFR-002); idempotency depends entirely on content-addressed keys + `If-None-Match`, so a bug there silently breaks AC-4; the 5%-drop gate risks false positives on small/sample runs and needs a documented override path, not just a hard stop.

(4) Hosted verification: AC-1 and AC-4 are proven on the actual deployed Step Functions execution in `eu-north-1` (execution ARN, CloudWatch logs, S3 object listing before/after a repeat run) — not Playwright, since this story has no UI. Evidence lands in `docs/evidence/B-02.md`: manifest CID used, `crm_property` count vs. Oracle's `coverage.parcels_published`, donphan's independent cross-check via the Oracle MCP, and a second identical run showing zero new S3 objects.

Disagreements flagged:
- With alakazam: none on index shape. DuckDB-over-Parquet is the ratified ADR-01, alakazam's own design input was already reconciled into it in the constitution, and `contract/v1` has no free text to embed — no vector/OpenSearch push expected or warranted.
- With machamp (likely friction point): on the sync/batch split, I'd keep `Plan`/`Validate`/`Promote` as thin Lambda steps under my ownership (schema, CID/digest guard, pointer-flip mechanics), with machamp owning `FetchPart`'s throttling/backoff/DLQ and any cost-gate Map state. If machamp proposes folding `BuildIndex` into Glue/PySpark for a dataset this small (sample-first, single county, well under Lambda's memory/time limits), I'd push back — a plain Lambda writing Parquet is sufficient and far cheaper; Glue should be reserved for genuine full-county/multi-county scale later, consistent with `build-batch-workflows`' staged-testing guidance (prove small before scaling the tool, not the other way around).

No code was written or edited; this is design opinion only, per the read-only consult scope.

## machamp — batch job, cost gate, idempotency

**Components/files (apps/sync):**
- `apps/sync/handlers/fetchPart.ts`: `FetchPart` Lambda, invoked via Distributed Map item processor with maxConcurrency 2–3. Each item = one manifest part.
- `packages/config/gatewayPolicy.ts`: shared ≤30 req/min token-bucket + exponential backoff with full jitter on 429/5xx, swappable per gateway (CloudFront → Filebase → Pinata).
- Idempotency key = `sha256(manifestCid + partPath)` → S3 key `crm-index/raw/{manifestCid}/{partSha256}.parquet`; write via `PutObject` with `If-None-Match: *` (content-addressed, so a retry is a no-op, not just "probably fine").
- DLQ: SQS dead-letter attached to the Map state's failure path; one CloudWatch alarm with an EventBridge-triggered self-resolving Lambda that drains/retries once backoff window clears, alerts only if DLQ depth > 0 after that.
- `apps/sync/handlers/costGate.ts` inside `Plan`: predicts spend from `coverage.parcels_published` + manifest byte size before `FetchPart` starts; holds (no state machine start) if predicted > $1.00/600k docs/2GB, writing a held-run record rather than silently proceeding.
- Step Functions execution name = manifest CID → built-in concurrent-execution guard, satisfying AC-4 for free at the orchestration layer (S3 idempotency is the belt-and-suspenders layer under retries/redrives).

**ADR-01 / ADR-07 surface:** My code never touches a search engine — `BuildIndex` just writes Parquet via vendored `packages/query-core` (`bindManifest()`, `views.sql`), digest-guarded against `profiles[].sha256` so a Task A republish with a drifted commit fails loud in `Plan`, not silently in `FetchPart`.

**Risks / disagreements:** If espeon's `BuildIndex` design puts any retry/pagination logic inside the index builder itself rather than treating `FetchPart`'s output as a sealed, already-verified batch, that duplicates throttling logic across two boundaries — I'd push back and keep `BuildIndex` purely local (no network). Also flag: a hard $1.00 cost-gate cliff on the full-county run risks false-holds from byte-size estimation error; I'd want the gate to use the manifest's declared size, not a live HEAD request, to avoid adding another throttled call.

**Verification:** rerun sync twice against the sample manifest on the deployed state machine in `eu-north-1`; assert zero new S3 keys and zero new executions (second start is rejected by the CID-named execution), captured in `docs/evidence/B-02.md` per AC-4.

## Disagreements table

| Topic | alakazam | espeon | machamp | Resolution |
| --- | --- | --- | --- | --- |
| Index shape / search store | ADR-01 accepted, no push for OpenSearch | ADR-01 accepted | ADR-01 accepted | Converged — ADR-01 already PO-accepted; not reopened |
| `BuildIndex` scope (network vs. local-only) | — | `BuildIndex` must stay a thin Lambda writing Parquet, no network; pushes back on Glue/PySpark at this scale | `BuildIndex` must treat `FetchPart`'s output as a sealed, already-verified batch — no retry/pagination logic inside it | Converged — both independently land on "BuildIndex is local, network-free, plain Lambda." No conflict; espeon's mechanics win per the story note if this ever drifts (espeon is primary builder) |
| Cost-gate sizing | — | — | Use manifest's declared byte size, not a live HEAD request, to avoid an extra throttled call | Adopted as-is (machamp owns the cost gate; no counter-proposal from the other two) |
| Vendored-code drift detection | Flags a real gap: digest guard doesn't catch a schema-compatible but semantically different manifest version (no explicit `contract` field yet — ARD §6 open item) | Vendoring + digest guard as designed | Digest guard as designed | Not a disagreement between agents — a shared, already-recorded open item (ARD-B §6, carried forward, not blocking G3). No new decision needed for B-02; `Plan` holds on digest mismatch as already specified |
| Review-time watch item | Reject any inline re-derivation of `status_class`/`open_days`/roof-age "for performance" instead of calling vendored `query-core` verbatim | (implicit — ADR-07 compliance) | (implicit — ADR-07 compliance) | No disagreement; flagged as a `/code-review` and reviewer-agent checkpoint at Phase E, not a design decision |

**No blocking disagreements requiring a Round 1 AskUserQuestion.** All three designs converge on: DuckDB/Parquet only (ADR-01), vendored query-core/contract with a digest guard (ADR-07), `BuildIndex` as a plain, network-free Lambda, and hosted-runtime (not local) verification of AC-1/AC-4. The two items carried to Round 1 remain the ones raised independently at G4 (AC-2 testability wording, eval-point/slicing), not anything from this design round.
