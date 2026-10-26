---
description: "Task list for B-02: lead search index"
---

# Tasks: Lead search index from Task A's published data

**Input**: Design documents from `specs/002-lead-index/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: MANDATORY (constitution X, XXI, XXII). Every task's test is written and shown failing before its implementation task runs. Phase Z (hosted-runtime proof) ends the build, per constitution XXII (tests run against the hosted runtime, never localhost).

**Builder**: delegated to exactly two `soofi-xyz-team-kit` subagents (constitution XV, per the story's own direction "Exactly two groups: INDEX and SYNC, one build wave"): **INDEX** → `soofi-xyz-team-kit:espeon` (skills `build-local-rag-pocs`, `build-rag-systems`, `use-elephant-mcp` + `apply-engineering-guidelines`); **SYNC** → `soofi-xyz-team-kit:machamp` (skills `build-batch-workflows`, `unify-metrics` + `apply-engineering-guidelines`). Both groups run in one build wave (parallel, not sequential), per `agent-design.md`'s convergence: `BuildIndex` (INDEX) only ever consumes `FetchPart`'s (SYNC) already-sealed, verified output — the seam is clean enough that neither blocks the other's start.

**Scope note**: this file covers Phases 1–5 and Z — Setup through the hosted-runtime proof of the build itself. Phase E (the review round: `espeon`/`alakazam`/`machamp`/`porygon`/`donphan` + `/code-review medium` → `docs/reviews/CR-B-02.md`) and Phase F (close-out: G7, merge, `docs/traceability.md`/`docs/kit-usage.md` updates, `scripts/progress.sh`) are the walkthrough's own run-book stages, orchestrated directly against this tasks.md's output rather than duplicated as tasks here — per the constitution's tasks-template intent (Phase Z proves the build; it does not re-host the story loop's later gates).

**Revision history**:
- **2026-10-23 (analyze fix, see `specs/002-lead-index/analyze-report.md`)**: D1 (CRITICAL — Article VIII Powertools/metrics had zero task coverage) fixed by T010/T011. D2 (HIGH — SC-005/NFR-001 sync-duration threshold unmeasured) fixed by T043.
- **2026-10-23 (G5 pre-check fix, see `docs/gates/G5-B-02-precheck.md`)**: C-03 (missing story tags/paths) fixed on T024/T031/T032/T034/T035/T036. C-04 (tests-first) fixed by splitting T024 into a test (T024) + implementation (T025) pair, and adding a test for the IAM Deny (T037). C-07 (architecture conformance) fixed by adding T020a asserting `Validate` never promotes a run with any DLQ'd/unverified part. C-02, C-05, C-08 (phase-by-builder-group vs. priority-ordered phases; Phase Z naming; "historical backfill"/"refresh" pattern wording) are addressed as recorded judgment calls in `plan.md`'s Complexity Tracking table, not by restructuring this file — see that table for the reasoning.

## Format: `[ID] [P?] [Group] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Group]**: INDEX or SYNC (omitted for Setup/Foundational/Phase Z)
- **[Story]**: US1–US4 from spec.md (omitted for Setup/Foundational/Phase Z, per the template's own convention that Setup/Foundational/Polish-equivalent phases carry no story label)

---

## Phase 1: Setup (shared infrastructure)

- [x] T001 Copy reused packages from Task A via `../assessment-guide/scripts/copy-from-oracle.sh` (never edit/commit/run anything in the Oracle folders): `packages/contract` → `packages/oracle-contract`, `packages/query-core` → `packages/oracle-views`, `scripts/verify-manifest.ts`. Log each copy's source commit and sha256 in `docs/reuse-log.md` (ADR-07 requires this record exists before any vendored code is imported).
- [x] T002 [P] Create `packages/index-schema/` package scaffold (`package.json`, `tsconfig.json`, pointing at `packages/tsconfig`'s base config, matching the existing `packages/config` layout).
- [x] T003 [P] Create `apps/sync/` app scaffold (`package.json`, `tsconfig.json`, `test/` directory), matching `apps/api`'s existing layout.
- [x] T004 [P] Create `scripts/local-rag-poc/` directory with its own minimal `package.json` (no new monorepo workspace needed — a standalone script invoked via `tsx`). **Note (G5 C-07):** this script reads vendored `packages/oracle-views`, which architecture-constitution.md §9 scopes to `apps/sync` and the agent's place resolver only; its use here is a recorded, justified deviation — see plan.md's Complexity Tracking table.
- [x] T005 Add `DATA_MANIFEST_CID` to `packages/config/src/index.ts`'s `RuntimeConfig` Zod schema (string, CID-shaped, required, read from `process.env.DATA_MANIFEST_CID` — never a hard-coded constant, per the story's explicit rule and architecture-constitution.md's config module boundary).

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ CRITICAL**: no INDEX or SYNC task below may start until this phase is complete.

- [x] T006 Write `packages/index-schema/test/schema.test.ts`: assert a `CrmProperty` object missing `sourceManifestCid` fails Zod validation, and one with `roofAgeYears: null, roofAgeBasis: "missing"` (or the contract's literal missing enum value) passes. Show it fail (no schema exists yet).
- [x] T007 Implement `packages/index-schema/src/index.ts`: Zod schemas for `CrmProperty`, `CrmPermit`, `IndexMeta`, and a generic `Provenanced<T>` wrapper, per data-model.md's field tables (every field listed there, with its nullable/missing-reason behavior as specified — `sourceManifestCid` required on every row, no `ownerName` field exists at all per ADR-03). Make T006 pass.
- [x] T008 [P] Write `apps/sync/test/plan.contract.test.ts` asserting `PlanResult`'s shape from contracts/sync-pipeline.md (`manifestCid`, `profiles`, `costEstimate`) and that a `profiles[].sha256` mismatch against a fixture vendored-package digest produces a `Held` result, never a thrown error that crashes the step. Show it fail.
- [x] T009 [P] Write `infra/test/crm-sync-stack.test.ts` and `infra/test/crm-data-stack.test.ts` replacing the current "intentionally empty" assertions (T005 from B-01) with assertions that the stacks now synthesize the S3 bucket, Step Functions state machine, and Lambda handlers. Show it fail against the current empty stubs.
- [x] T010 [P] Write `packages/observability/test/powertools.test.ts`: assert a handler wrapped with the shared middleware emits a structured JSON log entry, opens an X-Ray segment, and can record a named custom metric (constitution Article VIII: "Every Lambda uses Powertools Logger, Tracer and Metrics, with X-Ray on and JSON logs"). Show it fail (no shared middleware exists yet).
- [x] T011 Implement `packages/observability/src/powertools.ts` (or extend the existing `packages/observability` metric-constants file named in architecture-constitution.md §13's accepted deviation, if `apps/api` already has one — reuse, don't duplicate): a shared Logger/Tracer/Metrics middleware every new Lambda handler imports, plus named metric constants `SyncDurationMs`, `IndexColdLoadMs`, `IndexManifestAgeHours` in that one file (never inline string literals at a call site). Make T010 pass. Every handler task below (T015, T019, T021, T023, T025, T029, T034) MUST wrap its handler with this middleware — this is not optional per-handler discretion.

---

## Phase 3: INDEX group (espeon) — US1, US2, US3

**Goal**: the verified-copy, count-reconciliation, and missing-data-preservation behavior (AC-1, AC-2, AC-3). Independently testable via the local prototype (quickstart.md §1) before any AWS resource, then via the deployed `Plan`/`BuildIndex`/`Validate`/`Promote` steps (quickstart.md §2–3).

- [x] T012 [INDEX] [US1] Write `scripts/local-rag-poc/test/query.test.ts`: assert the CLI, run against `contract/v1/sample.parquet`, prints 35 roofing rows and at least one row with its roof-age `missing` reason intact. Show it fail (script doesn't exist).
- [x] T013 [INDEX] [US1] Implement `scripts/local-rag-poc/query.ts`: a query-only CLI over `contract/v1/sample.parquet` via vendored `packages/oracle-views`' `bindManifest()`/`QueryEngine` (build-local-rag-pocs discipline — no AWS resource). Make T012 pass. **Gate**: prove this against the real sample manifest before T014 starts (constitution XXI, this story's explicit rule 5).
- [x] T014 [INDEX] [US1] Write `apps/sync/test/buildIndex.test.ts`: given a fixture of already-verified parts (no network), assert `BuildIndex` writes `crm_property`/`crm_permit` rows each carrying `sourceManifestCid`, and makes zero network calls (assert via a mock that throws on any `fetch`/`https` call — per contracts/sync-pipeline.md's "must not call Task A or any gateway"). Show it fail.
- [x] T015 [INDEX] [US1] Implement `apps/sync/handlers/buildIndex.ts`: reads verified parts from S3, calls vendored `query-core`'s views/derivations verbatim (never re-derives `status_class`/`open_days`/roof age — ADR-07), Zod-validates every row against `packages/index-schema` before writing Parquet to `index/{manifestCid}/`. Wrap the handler with the shared Powertools middleware (T011). Make T014 pass.
- [x] T016 [INDEX] [P] [US3] Write `apps/sync/test/missingReasons.test.ts`: feed `BuildIndex` a fixture row with `roof_age_basis` recorded as the contract's literal `missing` value and no permit history; assert the output row preserves that exact reason and contains no invented/interpolated `roofAgeYears`. Show it fail.
- [x] T017 [INDEX] [US3] Extend `apps/sync/handlers/buildIndex.ts` (if T015's implementation doesn't already satisfy this) so missing-reason preservation is explicit and asserted, not incidental. Make T016 pass. (FR-003.)
- [x] T018 [INDEX] [US2] Write `apps/sync/test/validate.test.ts`: given a `BuildIndex` output with a known row count, assert `Validate` sets `status: "Validated", reconcileDiff: 0`when the count matches `coverage.parcels_published` exactly; `status: "Validated", reconcileDiff: n` when `n` is a non-zero difference of at most 0.1% of `coverage.parcels_published` (Round 1 decision, 2026-10-23: tightened from "any documented difference" to this constitution §10 threshold); `status: "Held", heldReason: "reconcile_diff_exceeds_tolerance"` when the difference exceeds 0.1%; `status: "Held", heldReason: "drop_over_5_percent"` when the new count is >5% below the previous promoted run's count; and that in every case zero rows are missing `sourceManifestCid`. Show it fail.
- [x] T019 [INDEX] [US2] Implement `apps/sync/handlers/validate.ts` per contracts/sync-pipeline.md's `Validate` contract and data-model.md's `index_meta`/reconcile rules. Wrap the handler with the shared Powertools middleware (T011). Make T018 pass. (FR-002.)
- [x] T020 [INDEX] [US1] Write `apps/sync/test/validate.quarantine.test.ts` **(fixes G5 C-07)**: given a `FetchPart` result marking any part as DLQ'd/unverified (per contracts/sync-pipeline.md's "FetchPart ... routes to the DLQ"), assert `Validate` sets `status: "Held"` for the whole run — a run is never promoted with one unverified part, even if every other part verified and the overall row-count drop is within tolerance (constitution P0-2/§12.2: "a run with a failed part is never promoted"). Show it fail.
- [x] T020a [INDEX] [US1] Extend `apps/sync/handlers/validate.ts` to check for any DLQ'd/unverified part before evaluating row counts, holding first on that condition alone. Make T020 pass.
- [x] T021 [INDEX] [US1] [US4] Write `apps/sync/test/promote.test.ts`: assert `Promote` only flips `META#index.current` for a `Validated` run (never `Held` or partial), via a DynamoDB conditional write guarded on the previous pointer value; assert a second `Promote` call for an already-promoted `manifestCid` is a no-op, not a duplicate write. Show it fail.
- [x] T022 [INDEX] [US1] [US4] Implement `apps/sync/handlers/promote.ts` per contracts/sync-pipeline.md. Wrap the handler with the shared Powertools middleware (T011) and emit the `SyncDurationMs` metric (elapsed time from this run's `Plan` start to this `Promote` completion) on a successful promotion — this is the one metric-emission point for the whole pipeline's duration, per NFR-001/SC-005. Make T021 pass. (Constitution P0-3: no partial promotion.)
- [x] T023 [INDEX] [P] [US1] Write `apps/sync/test/plan.digestGuard.test.ts`: assert `Plan` holds (not fails/throws uncaught) when a `profiles[].sha256` in the manifest does not match the vendored `packages/oracle-contract`/`oracle-views` copy's recorded digest. Show it fail.
- [x] T024 [INDEX] [US1] Implement `apps/sync/handlers/plan.ts`: resolves the authoritative `manifestCid` (SSM-pinned, or a verified `runs/index.json` hint), the `profiles[].sha256` digest guard (T023), and the cost-gate check (sized from the manifest's own declared byte size per machamp's refinement in research.md — not a live HEAD request). Wrap the handler with the shared Powertools middleware (T011) and record this run's start timestamp (read back by T022 to compute `SyncDurationMs`). Make T008 and T023 pass.
- [x] T025 [INDEX] [P] [US1] Write `apps/api/test/duckDbParquet.test.ts` **(fixes G5 C-04)**: assert the `LeadIndex` port's typed-error contract (`INDEX_NOT_READY` when no run has ever promoted, `INDEX_COLD_LOAD_TIMEOUT` on a fixture that exceeds the cold-load budget), before any adapter code exists. Show it fail.
- [x] T026 [INDEX] [P] [US1] Implement `apps/api/src/adapters/duckDbParquet.ts`: the `LeadIndex` port (`indexInfo`, `searchProperties`, `searchPermits`, `getProperty`) per contracts/lead-index-port.md, over S3 Parquet via DuckDB, with an explicit per-sandbox, per-manifest `/tmp` cache (not per-request — this caching is ADR-01's whole cost argument and must be visible in code, per alakazam's consult). Wrap with the shared Powertools middleware (T011) and emit `IndexColdLoadMs` around the first-download-and-open path (only on an actual cold load, not a warm cache hit). Make T025 pass.

---

## Phase 4: SYNC group (machamp) — US1, US4

**Goal**: the queued, idempotent, cost-gated batch mechanics (AC-1's fetch half, AC-4). Independently testable against the deployed state machine (quickstart.md §4).

- [x] T027 [SYNC] [P] [US1] Write `packages/config/test/gatewayPolicy.test.ts`: assert the token-bucket enforces ≤30 requests/min per gateway and that a 429/5xx response triggers exponential backoff with full jitter, capped at 5 retries before switching gateway (NFR-002). Show it fail.
- [x] T028 [SYNC] [US1] Implement `packages/config/gatewayPolicy.ts`: the shared rate-limit/backoff policy, parameterized per gateway (CloudFront, Filebase, Pinata). Make T027 pass.
- [x] T029 [SYNC] [US1] Write `apps/sync/test/fetchPart.test.ts`: assert `FetchPart` tries CloudFront first, falls back to Filebase then Pinata on failure (never ipfs.io/dweb.link), verifies every downloaded part's sha256 against the manifest before returning it, and routes to the DLQ after 5 exhausted retries rather than returning unverified bytes. Show it fail.
- [x] T030 [SYNC] [US1] Implement `apps/sync/handlers/fetchPart.ts` using `gatewayPolicy.ts` (T028), with Step Functions Distributed Map concurrency 2–3. Wrap the handler with the shared Powertools middleware (T011). Make T029 pass. (FR-001, ADR-02.)
- [x] T031 [SYNC] [P] [US4] Write `apps/sync/test/idempotency.test.ts`: assert the S3 write key is `sha256(manifestCid + partPath)` and that a `PutObject` with `If-None-Match: *` against an existing key is a no-op (zero new objects), not an overwrite or error. Show it fail.
- [x] T032 [SYNC] [US4] Implement the content-addressed idempotency key derivation and `If-None-Match` write path inside `apps/sync/handlers/fetchPart.ts`. Make T031 pass. (AC-4/FR-004.)
- [x] T033 [SYNC] [P] [US1] Write `apps/sync/test/dlq.test.ts`: assert a part that exhausts retries lands on the DLQ and that exactly one CloudWatch alarm fires per DLQ-depth-above-zero event (not once per message), and that the alarm self-resolves once the DLQ drains. Show it fail.
- [x] T034 [SYNC] [US1] Implement the DLQ + self-resolving alarm wiring in `infra/lib/crm-sync-stack.ts`. Wrap the handler that drains/retries with the shared Powertools middleware (T011). Make T033 pass. (Constitution Article VII.)
- [x] T035 [SYNC] [P] [US1] Write `apps/sync/test/costGate.test.ts`: assert `Plan`'s cost-gate check (called from T024) holds the run when predicted spend exceeds $1.00, predicted doc count exceeds 600,000, or predicted bytes exceed 2 GB, sized from the manifest's declared byte size, not a live network call. Show it fail.
- [x] T036 [SYNC] [US1] Implement `apps/sync/handlers/costGate.ts`, called from `Plan` (T024). Wrap with the shared Powertools middleware (T011). Make T035 pass. (ADR-05.)
- [x] T037 [SYNC] [US1] Write `infra/test/iam-deny.test.ts` **(fixes G5 C-04)**: assert `infra/lib/crm-sync-stack.ts`'s synthesized IAM policy document contains an explicit `Deny` statement for every Task A resource ARN listed in architecture-constitution.md §7, on every role the stack creates. Show it fail.
- [x] T038 [SYNC] [US1] Fill `infra/lib/crm-sync-stack.ts` and `infra/lib/crm-data-stack.ts` (currently intentionally empty stubs from B-01/T005) with the Step Functions state machine (`Plan → FetchPart(Map) → BuildIndex → Validate → Promote`), its Lambdas, and the private S3 bucket (`crm-index`, Block Public Access, SSE, `enforceSSL`). Add the explicit IAM Deny on Task A's resource ARNs (constitution P0-1, espeon's original proposal, kept as defense-in-depth per research.md) to every role created. Make T009 and T037 pass. Reuses the existing `crm-leads` DynamoDB table for the `META#index` pointer item — no new table (architecture-constitution.md §9).

---

## Phase 5: Integration check (after INDEX and SYNC both complete)

- [x] T039 Run the full workspace integration check: `pnpm vitest run`, `pnpm typecheck`, `pnpm lint`, `pnpm format --check`, across every package/app touched by T001–T038. Fix any red result before Phase Z.
- [x] T040 Copy and adapt the reuse-table test files per WALKTHROUGH-B-sample-first.md §3: `tests/e2e/manifest.spec.ts`, `cid-copy.spec.ts`, `fallback.spec.ts`, `verify-manifest.spec.ts`, `apps/api/test/query.test.ts`, `apps/api/test/duckdb-node.test.ts` — rename CountyLens-specific names, point at this repo's `LeadIndex` port, run and confirm green.

---

## Phase Z: Prove on the hosted runtime (constitution Article I, XXII)

- [x] T041 Deploy `CrmData` and `CrmSync` to `eu-north-1` (`cdk deploy CrmData CrmSync`); record the stack outputs and trace IDs.
- [ ] T042 Trigger the deployed state machine against `DATA_MANIFEST_CID = bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`; confirm `SUCCEEDED` and that `META#index.current` was flipped (quickstart.md §2). **Open**: execution `-dbg14` reached `Validated` but FAILED at `Promote` — blocked on B-07's `crm-leads` table not yet existing (see `docs/evidence/B-02.md` "Known gap"). Left open, not deferred, per the G7 pre-check's own instruction: re-run once `crm-leads` exists.
- [~] T043 Compare the deployed index's `propertyCount` against the sample manifest's `coverage.parcels_published`; have `soofi-xyz-team-kit:donphan` independently confirm the same count through the Oracle MCP (cross-check only, never on the request path) (quickstart.md §3, AC-2 in shape). **Deferred**: the internal count match (14=14) is proven; `donphan`'s independent MCP confirmation is blocked — Travis County is not yet published to this environment's Elephant MCP index. Same blocker as T051.
- [~] T044 Re-run the sync against the same `manifestCid`; diff S3 object counts before/after and confirm zero new objects; confirm the second `start-execution` is rejected by the CID-named execution guard (quickstart.md §4, AC-4). **Deferred**: zero-new-S3-objects is proven (26→26); the same-CID-named execution rejection needs re-proof once a true end-to-end (including Promote) rerun is possible. Same blocker as T052.
- [~] T045 Read the `SyncDurationMs` metric (emitted by T022) from the deployed execution triggered in T042; assert it is ≤ 5 minutes for this sample-manifest-sized run, against NFR-001/SC-005's threshold. Record the measured value — this is also the first real measurement for the plan's Technical Context note that the full-county 30-minute threshold is a projection to re-tighten later. **Deferred**: the metric is only emitted on a successful `Promote`, which hasn't completed yet. Same blocker as T050.
- [x] T046 Write `docs/evidence/B-02.md`: manifest CID used, counts vs. Task A's published coverage, `donphan`'s MCP cross-check, the idempotent-rerun proof, the measured `SyncDurationMs` from T045, and every Step Functions execution ARN / trace ID used as evidence. Written; the donphan/SyncDurationMs sections record why they're pending (T043/T045), per T056.

---

## Dependencies

- Phase 1 (Setup) → Phase 2 (Foundational) → Phases 3 (INDEX) and 4 (SYNC) run **in parallel, one build wave** → Phase 5 (integration) → Phase Z (hosted proof).
- T011 (shared Powertools middleware) gates every handler implementation task that wraps with it: T015, T019, T022, T024, T026, T030, T036.
- Within Phase 3: T013 (local prototype, proven) gates T014 onward, per the story's explicit rule 5 (espeon's own discipline). T015 → T017 (same file). T018 → T019 → T020 → T020a. T021 → T022. T023/T008 → T024. T024 (records run start) → T022 (reads it back for `SyncDurationMs`) — a cross-task data dependency, not just ordering. T025 → T026.
- Within Phase 4: T027 → T028 → T030 (T029 tests T030). T031 → T032. T033 → T034. T035 → T036. T037 → T038. T038 also depends on T024 (Plan), T030 (FetchPart), T015 (BuildIndex), T019/T020a (Validate), T022 (Promote) all existing as Lambda handlers to wire into the state machine — this is the one hard INDEX/SYNC convergence point.
- T025/T026 (the `LeadIndex` port) can start as soon as `packages/index-schema` (T007) and the Powertools middleware (T011) exist — it doesn't need the sync pipeline to be deployed, only the row shape it will query.
- T045 depends on T022/T024 (duration recording) and T042 (a completed hosted execution to measure).

## Parallel execution examples

- Phase 1: T002, T003, T004 run in parallel (different directories); T001 and T005 are independent of them.
- Phase 2: T010/T011 (observability) can run in parallel with T006/T007 (index-schema) and T008/T009 (contract/infra tests) — different files, no shared dependency.
- Phase 3 vs. Phase 4: the whole INDEX group and the whole SYNC group run in parallel subagents (espeon, machamp) in one build wave — their only shared dependency is Phase 2 and the eventual wiring in T038.
- Within Phase 3: T016/T017 (US3) can run in parallel with T018–T020a (US2) once T015 (US1's `BuildIndex`) lands, since they touch different test files.
- Within Phase 4: T027/T028, T031/T032, T033/T034, T035/T036 are four independent [P] sub-tracks until T038 wires them together.

## Implementation strategy

**MVP scope**: US1 (verified copy, AC-1) is the only story that must ship for every later story (B-03, B-07, B-09) to have anything to read. US2 (count reconciliation) and US3 (missing-data preservation) are both P1 and ship in the same build wave since they share `BuildIndex`/`Validate` — splitting them further would not reduce risk. US4 (idempotency) is P2 and can, in principle, land after US1–US3 if the budget forces a cut, but AC-4 is required for G7, so it is not deferred in practice here.

**Why phases are grouped by builder (INDEX/SYNC), not strict priority order (G5 C-02):** the story's own front matter names exactly two builders (`espeon`, `machamp`), and the run script explicitly directs "Exactly two groups ... one build wave." Reordering Phase 3/4 into priority-only phases would either split each builder's tasks across multiple phases (defeating the one-subagent-per-group delegation in constitution XV) or force a sequential INDEX-then-SYNC build where none is architecturally required (per `agent-design.md`'s convergence that `BuildIndex` and `FetchPart` are independent). This is a recorded judgment call, not an oversight — see plan.md's Complexity Tracking table.

---

## Phase 6: Convergence

Found by `/speckit-converge` (2026-10-23) assessing the actual codebase against spec.md/tasks.md/the constitution — checkbox state was not used as evidence.

- [x] T047 CRITICAL: `apps/sync/handlers/plan.ts`'s `fetchManifestBytes` must verify the fetched manifest's own bytes against its CID (sha256/CID digest check) before use — currently only the manifest's *parts* are verified downstream, not the manifest itself, contradicting FR-001's "verify every byte... before use" and architecture-constitution.md §6/§8 per FR-001 (contradicts) — **Fixed 2026-10-23**: CIDv1/sha256 digest check added; mismatch holds the run (`digest_mismatch`), never proceeds unverified. See `docs/evidence/B-02.md` "Convergence fixer round".
- [x] T048 CRITICAL: Wrap `apps/api/src/adapters/duckDbParquet.ts` (the `LeadIndex` port) with the shared Powertools observability middleware (`withObservability`), per Constitution Article VIII ("Every Lambda uses Powertools Logger, Tracer and Metrics") per Constitution Article VIII (missing) — **Fixed 2026-10-23**: added `withObservabilityOperation` (sibling of `withObservability`), wrapped all four public methods.
- [x] T049 Implement `Plan`'s authoritative manifest-CID resolution (SSM-pinned parameter, or a verified `runs/index.json` hint) in `apps/sync/handlers/plan.ts`, instead of relying solely on an unverified `input.manifestCidHint` per T024 (partial) — **Fixed 2026-10-23**: SSM parameter and verified `runs/index.json` hint resolution added, with hint-only fallback preserved.
- [~] T050 Once `crm-leads` (B-07) exists, re-run the deployed state machine end to end: confirm `Promote` reaches `SUCCEEDED`, `META#index.current` flips, and record the measured `SyncDurationMs` against the ≤5 min NFR-001/SC-005 threshold per T042/T045, SC-005 (missing) — **Deferred**: blocked on B-07's `crm-leads` table, same as the existing "Known gap" in `docs/evidence/B-02.md`. Not a B-02 defect.
- [~] T051 Once Travis County is published to the Elephant MCP index, re-run `soofi-xyz-team-kit:donphan`'s independent Oracle MCP cross-check of `propertyCount` per T043, AC-2 (missing) — **Deferred**: blocked on Travis County's MCP publication, same as the existing AC-2 gap in `docs/evidence/B-02.md`. Not a B-02 defect.
- [~] T052 Re-prove the idempotent-rerun (AC-4) using the same CID-named Step Functions execution (not a differently-named debug execution), and record that execution's final status, so the execution-name collision guard is demonstrated against a true repeat invocation per T044, AC-4 (partial) — **Deferred**: the full idempotency proof (zero new S3 objects across two full end-to-end runs including Promote) also needs `crm-leads` to exist first; re-attempt alongside T050.
- [x] T053 Add a sha256 column to `docs/reuse-log.md` for each file copied from Task A, per ADR-07's digest-guard record requirement per T001, ADR-07 (partial) — **Fixed 2026-10-23**: sha256 column added for every vendored file/package.
- [x] T054 Strengthen `infra/test/iam-deny.test.ts` to assert the denied ARNs match architecture-constitution.md §7's named Task A access categories, not just that a Deny statement exists on every role per T037 (partial) — **Fixed 2026-10-23**: test now resolves and asserts the actual Deny ARNs; `task-a-deny.ts` already conformed.
- [x] T055 Strengthen `apps/sync/test/dlq.test.ts` to assert exactly one CloudWatch alarm fires per DLQ-depth-above-zero event (not per message) and that it self-resolves once the DLQ drains per T033 (partial) — **Fixed 2026-10-23**: test now asserts the alarm's evaluation/comparison/treat-missing-data config and OK-action wiring; `crm-sync-stack.ts`'s alarm already conformed.
- [~] T056 Update `docs/evidence/B-02.md`'s donphan-cross-check and `SyncDurationMs` sections with final values once T050/T051 complete per T046 (partial) — **Deferred**: depends on T050/T051.
- [~] T057 (low priority) Consider strengthening `scripts/local-rag-poc/test/query.test.ts` to assert a roof-age-specific missing reason once the sample manifest contains such a row (FR-003 is otherwise already covered by T016/T017) per T012 (partial) — **Deferred**: optional polish, no behavior at risk.
