---
id: QC-TC-B-02
type: test-cases
title: Build the lead search index from Task A's published data
parent: FEAT-B02
story: stories/B-02-lead-index.md
spec: specs/002-lead-index/spec.md
owner: HebaGaber
status: Draft
gate: G6
version: 0.1
created: 2026-10-23
runtime_url: https://crm.aldarraj.com (or the current 002-lead-index Amplify branch preview)
reviewed_code: "f57624e (unit tests); 81cbcb2 (deployed AWS build, execution -dbg14/-dbg15)"
qc_signoff: false
---

# Test Cases: B-02 Build the lead search index from Task A's published data

> Drafted from `stories/B-02-lead-index.md`'s Given/When/Then ACs and `specs/002-lead-index/spec.md`'s FRs, independent of `tasks.md`. This story has `ui: false`, so every case proves itself on the **deployed Step Functions execution in `eu-north-1`** (the hosted runtime for a story with no UI), never localhost — per constitution Article I and XXII. Three cases are adapted from Task A's `testplans/A-03-test-cases.md` (tagged `from A TC-nnn`), changing only the data and the target system, per `WALKTHROUGH-B-sample-first.md` §3.

## 1. Feature overview

The sync job fetches Task A's published property and roofing-permit tables by CID, verifies every byte, and writes the CRM's own `crm_property`/`crm_permit` Parquet index, carrying provenance on every row and flipping the `META#index` pointer only after validation passes. This story has no UI; its value is proven by the index's correctness, completeness, and safety to re-run.

## 2. Requirement mapping

| Source | Reference | Covered by |
| --- | --- | --- |
| Acceptance criterion | B-02-AC-1 | TC-001, TC-002, TC-003 |
| Acceptance criterion | B-02-AC-2 (scale) | TC-004, TC-005 |
| Acceptance criterion | B-02-AC-3 (missing-data) | TC-006, TC-007 |
| Acceptance criterion | B-02-AC-4 | TC-008, TC-009 |
| Functional requirement | FR-001 | TC-001, TC-002, TC-003 |
| Functional requirement | FR-002 | TC-004, TC-005 |
| Functional requirement | FR-003 | TC-006, TC-007 |
| Functional requirement | FR-004 | TC-008, TC-009 |
| NFR | NFR-001 (sync duration) | TC-NF-01 (sample scale), TC-NF-03 (full-county scale, gap-linked) |
| NFR | NFR-002 (gateway politeness) | TC-010 |
| NFR | architecture-constitution.md §10 (index cold load) | TC-NF-02 |
| Edge case | one part fails verification → quarantine, no partial promotion | TC-011 |
| Edge case | row count drops > 5% → held for review | TC-012 |

## 3. Assumptions

- The sample manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (35 roofing rows, Austin permits, September 2026) is used for every case except TC-004/TC-005's full-county scale assertion, which is exercised in shape only until the "S · Data switch" step (per the story's note under AC-2).
- "Open the hosted runtime" for this UI-less story means: read the deployed Step Functions execution's status/output (via the AWS CLI or console under profile `assess`, region `eu-north-1`) and query the deployed API Lambda's `indexInfo()`/`searchProperties()` — never a local DuckDB file, never `localhost`.
- `donphan`'s MCP cross-check is read-only and never on the request path.
- **Terminology note:** the story and `data-model.md` use "missing" as shorthand for "no reliable roof-age evidence." The contract's actual `roof_age_basis` enum (`contract/v1/columns.json`) has no literal `"missing"` value — its members are `permit`, `new_construction`, `built_year`, `unknown`. `"unknown"` is the missing-equivalent value `BuildIndex`/the schema actually preserve. This 35-row permits-only sample manifest happens to contain zero rows with `roof_age_basis = "unknown"` (confirmed by direct query against `contract/v1/sample.parquet`) — every row has `permit` or `built_year`. TC-006/TC-007 are therefore proven against a fixture row at the unit level (`apps/sync/test/missingReasons.test.ts`, `apps/api/test/duckDbParquet.test.ts`), not a live query against this specific sample, which has no such row to query.

## 4. Scope

- **In scope:** CID fetch and verification, gateway fallback order, count reconciliation, missing-data preservation, idempotent re-run, the cost/lineage hold conditions, gateway politeness.
- **Out of scope:** any UI rendering of this data (B-03, B-07, B-09); the agent (B-09); full-county reconciliation at real scale (deferred to the "S · Data switch" step, flagged as a known gap until then).

## 5. Test data

- Manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` (run `travis-202609-permits-20261021t103516z`), 35 roofing rows, Austin permits for September 2026.
- A **synthetic fixture** property row with `roof_age_basis: "unknown"` and no permit history, shaped after the story's own "parcel near Del Valle" example. This is explicitly a fixture, not a real published row: the sample manifest (35 permit rows) contains zero rows with `roof_age_basis = "unknown"` (confirmed by direct query against `contract/v1/sample.parquet`), so no real CID can be named here. See the terminology note above and TC-006.
- Data snapshot for every case below: this same manifest CID, recorded in `docs/evidence/B-02.md` once run.

## 6. Environment, risks and dependencies

- AWS profile `assess`, region `eu-north-1`. `DATA_MANIFEST_CID` read from deployed config, never hard-coded in a test.
- Known gap: AC-2's full-county count check is exercised in shape only against the sample (35 rows); the real reconciliation happens at the later "S · Data switch" step — TC-004/TC-005 are written to pass in shape now and are expected to be re-run at full scale later, not re-written.
- Dependency: B-01's CrmData/CrmSync stacks (currently empty stubs) must be filled before any case here can run against a deployed execution.
- **Automation exception (G6 C-09):** this story has `ui: false` — there is no page for Playwright to drive, and the four `tests/e2e/*.spec.ts` files inherited from Task A's A-03 reuse table were confirmed (2026-10-23) to assert on Oracle's own pipeline UI/export shape, not anything B-02 builds — they're marked explicitly out of scope in their own file headers, not fixed up. The real automation for each P1/P2 case below is one of three things, named exactly in § 7's Automation column: (a) a Vitest unit/contract test in `apps/sync/test/`, `apps/api/test/`, or `packages/config/test/` that exercises the real handler/adapter logic against fixtures (not a mock of the thing itself) — this is the accepted hosted-runtime substitute for a no-UI story, per constitution Article XXII's own allowance for a non-browser proof target; (b) a direct check against the live deployed AWS resources (Step Functions execution, S3 object counts, DynamoDB), recorded in `docs/evidence/B-02.md`; or (c) a manual step with no automated check, also recorded there. § 7's Automation column states which of the three applies per case — it does not claim a literal test name matching `B-02-TC-nnn` exists inside any file; that string is this document's own case ID, used here as a mapping key, not as an assertion about test source text. **This substitution needs the QC Lead's (user's) ratification at G6 approval — see the Decision line below.**

## 7. Coverage matrix

| TC ID | Title | Priority | Tags | Type | Requirement(s) | Automation |
| --- | --- | --- | --- | --- | --- | --- |
| B-02-TC-001 | Sync fetches `v_property`/`v_roofing_permit` by CID, verified by sha256 (from A TC-003) | P1 | @smoke @pipeline | AWS | AC-1, FR-001 | manual + `docs/evidence/B-02.md` (live Step Functions execution). `tests/e2e/manifest.spec.ts`, inherited from Task A's reuse table, is confirmed out of scope — it asserts on Oracle's own pipeline export shape, not B-02's (see its file header). |
| B-02-TC-002 | Every indexed row carries `sourceManifestCid` | P1 | @smoke | AWS | AC-1, FR-001 | `apps/api/test/query.test.ts` (API port read-path) + `apps/sync/test/buildIndex.test.ts` (write-path); `sourceManifestCid` is also schema-enforced (`packages/index-schema`, strict Zod) |
| B-02-TC-003 | CID copy down → Filebase → Pinata fallback, in order (from A TC-032/033/034) | P1 | @negative @error | AWS | AC-1, FR-001, NFR-002 | `apps/sync/test/fetchPart.test.ts` (gateway-fallback assertions, mocked `fetcher.fetch`). `tests/e2e/fallback.spec.ts`, inherited from Task A's reuse table, is confirmed out of scope — B-02 has no `/permits` UI (see its file header). |
| B-02-TC-004 | `crm_property` count equals manifest `coverage.parcels_published` (shape, sample scale) | P1 | @pipeline | AWS | AC-2, FR-002 | manual + `docs/evidence/B-02.md` (live `Validate` step output). `tests/e2e/verify-manifest.spec.ts`, inherited from Task A's reuse table, is confirmed out of scope — see its file header. |
| B-02-TC-005 | `donphan` independently confirms the count through the Oracle MCP | P1 | @cross-check | MCP | AC-2, FR-002 | manual + `docs/evidence/B-02.md` |
| B-02-TC-006 | Missing roof-age reason preserved verbatim, never guessed | P1 | @missing-data | AWS | AC-3, FR-003 | `apps/sync/test/missingReasons.test.ts` (write-path, fixture row) + `apps/api/test/duckDbParquet.test.ts` (read-path) |
| B-02-TC-007 | No row in the index has an invented/interpolated value where a `missing` reason was published | P1 | @missing-data | AWS | AC-3, FR-003 | `apps/sync/test/missingReasons.test.ts`, `apps/sync/test/buildIndex.test.ts` |
| B-02-TC-008 | Re-sync of an already-indexed manifest CID creates zero new S3 objects | P1 | @smoke @idempotency | AWS | AC-4, FR-004 | manual + `docs/evidence/B-02.md` (live S3 object count), backed by `apps/sync/test/idempotency.test.ts`'s unit-level proof of the same key-derivation/`If-None-Match` logic |
| B-02-TC-009 | A second concurrent execution for the same manifest CID is rejected with `ExecutionAlreadyExists`, not run in parallel | P2 | @idempotency | AWS | AC-4, FR-004 | manual (`start-execution` twice) + `docs/evidence/B-02.md` |
| B-02-TC-010 | Gateway politeness: Distributed Map concurrency 2–3 per gateway, ≤30 req/min per gateway, backoff+jitter on 429/5xx | P2 | @perf @negative | AWS | NFR-002 | `packages/config/test/gatewayPolicy.test.ts`, `apps/sync/test/fetchPart.test.ts`'s retry-counter test |
| B-02-TC-011 | A part's bytes fail sha256 → quarantined, alarm fires, previous index still serves | P1 | @negative @edge | AWS | Edge case 1 | `apps/sync/test/fetchPart.test.ts` (DLQ-routing assertion) |
| B-02-TC-012 | Row count drop > 5% from the previous run → held for review, never silently promoted | P1 | @negative @edge | AWS | Edge case 2 | `apps/sync/test/validate.test.ts` |
| B-02-TC-NF-01 | Sync duration ≤ 5 min for the sample-manifest-sized run | P2 | @perf | AWS | NFR-001 | manual + `docs/evidence/B-02.md` (`SyncDurationMs`) |
| B-02-TC-NF-02 | Index cold load ≤ 3 s per sandbox per manifest | P2 | @perf | AWS | architecture-constitution.md §10 | manual (`IndexColdLoadMs` metric); unit-level cold-load-timeout/race tests exist in `apps/api/test/duckDbParquet.test.ts` |
| B-02-TC-NF-03 | Sync duration ≤ 30 min for the full-county run | P2 | @perf | AWS | NFR-001 (full-county) | manual + `docs/evidence/B-02.md` (`SyncDurationMs`) — gap-linked, not run until full-county manifest is published |

## 8. Functional test cases

### B-02-TC-001: Sync fetches `v_property`/`v_roofing_permit` by CID, verified by sha256 (happy path) (from A TC-003)

- **Priority / tags:** P1 · `@smoke @pipeline`
- **Maps to:** AC-1, FR-001
- **Target:** the deployed `crm-sync` Step Functions state machine (`Plan → FetchPart → BuildIndex → Validate → Promote`) in `eu-north-1`.
- **Preconditions:** `CrmData`/`CrmSync` deployed to `eu-north-1`; `DATA_MANIFEST_CID = bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`.
- **Test data:** the sample manifest CID above.
- **Steps:**
  1. **Trigger** the deployed `crm-sync` state machine with execution name = the manifest CID.
  2. **Wait** for the execution to reach `SUCCEEDED` (`aws stepfunctions describe-execution`).
  3. **Fetch** the manifest at that CID.
  4. **Read** its `artifacts[]` entries for `v_property` and `v_roofing_permit`.
  5. **Verify** each fetched part's sha256 (recorded in the `FetchPart` step's CloudWatch log) matches the manifest's stated digest for that artifact.
- **Expected result:** execution status `SUCCEEDED`; both parts' sha256 match the manifest exactly; no part shows a mismatch.

### B-02-TC-002: Every indexed row carries `sourceManifestCid` (happy path)

- **Priority / tags:** P1 · `@smoke`
- **Maps to:** AC-1, FR-001
- **Target:** the deployed API Lambda's `LeadIndex` port (`apps/api/src/adapters/duckDbParquet.ts`).
- **Preconditions:** TC-001 has completed successfully.
- **Steps:**
  1. **Query** the deployed API Lambda's `indexInfo()` for the current promoted `manifestCid`.
  2. **Query** `searchProperties({})` (no filter).
  3. **Record** the returned row count (expected: 14, matching `coverage.parcels_published`) and each row's `sourceManifestCid`.
  4. **Query** `searchPermits({})` (no filter).
  5. **Record** the returned row count (expected: 35, matching `coverage.permits_emitted`) and each row's `sourceManifestCid`.
  6. **Verify** every returned row's `sourceManifestCid` field equals `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i` exactly.
- **Expected result:** 100% of rows carry the correct `sourceManifestCid`; zero rows with a missing or mismatched value.

### B-02-TC-003: CID copy down → Filebase → Pinata fallback, in order (negative) (from A TC-032/033/034)

- **Priority / tags:** P1 · `@negative @error`
- **Maps to:** AC-1, FR-001, NFR-002
- **Target:** `apps/sync/handlers/fetchPart.ts`'s gateway-fallback logic (`apps/sync/test/fetchPart.test.ts`).
- **Fault injection method:** a Vitest-mocked `fetcher.fetch` (the same seam `fetchPart.test.ts` already uses) configured to reject/return non-2xx for specific gateway base URLs in sequence — not a live network fault against production CloudFront/Filebase/Pinata.
- **Steps:**
  1. **Configure** the mocked fetcher to fail every request to the CloudFront base URL (`GATEWAY_CLOUDFRONT_BASE_URL`) with a connection abort.
  2. **Verify** the fetch falls back to Filebase, labeled `fallback` in the handler's structured log.
  3. **Configure** the mocked fetcher to additionally fail every request to the Filebase base URL with a 500 response.
  4. **Verify** the fetch falls back to Pinata next, in that exact order — never ipfs.io or dweb.link at any point (asserted via `createHttpGatewayFetcher`'s own throw-on-those-hosts guard).
  5. **Verify** the final returned bytes still pass sha256 verification against the manifest, regardless of which gateway served them.
- **Expected result:** gateway order is exactly CloudFront → Filebase → Pinata; the log records `fallback` at each hop; the part's sha256 is verified no matter which gateway it came from.

### B-02-TC-004: `crm_property` count equals manifest `coverage.parcels_published` (shape check at sample scale)

- **Priority / tags:** P1 · `@pipeline`
- **Maps to:** AC-2, FR-002
- **Target:** the deployed `Validate` step's output (`apps/sync/handlers/validate.ts`) and the API Lambda's `indexInfo()`.
- **Preconditions:** TC-001 has completed; the sample manifest's `coverage.parcels_published` value is known.
- **Steps:**
  1. **Query** the deployed index's property-record count via `indexInfo()`.
  2. **Compare** it to the sample manifest's `coverage.parcels_published` value.
  3. **If they differ**, verify `docs/evidence/B-02.md` records every difference with a reason, per FR-002.
- **Expected result:** counts match exactly, or the difference is at most 0.1% of the manifest's published count, documented in `docs/evidence/B-02.md` with its reason — a difference over 0.1%, or any undocumented difference, is a FAIL. *(Known gap: this proves the mechanism in shape against 35 sample rows; real full-county reconciliation is a separate step, not re-tested here until then.)*

### B-02-TC-005: `donphan` independently confirms the count through the Oracle MCP

- **Priority / tags:** P1 · `@cross-check`
- **Maps to:** AC-2, FR-002
- **Target:** the Oracle MCP's published Travis County property count, cross-checked against TC-004's `indexInfo().propertyCount`.
- **Steps:**
  1. **Ask** `soofi-xyz-team-kit:donphan` (via the Oracle MCP, read-only, never on the request path) for the sample manifest's published property count.
  2. **Compare** the integer `donphan` returns to the integer read via TC-004's `indexInfo().propertyCount`.
- **Expected result:** the two integers are numerically equal to `coverage.parcels_published` (14 for the sample manifest). A numeric mismatch is a FAIL, recorded in `docs/evidence/B-02.md` with which source was stale (per the story's "if something goes wrong" guidance — never averaged or silently accepted).

### B-02-TC-006: Missing roof-age reason preserved verbatim, never guessed (missing data)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-3, FR-003
- **Target:** `apps/sync/handlers/buildIndex.ts`'s row-mapping (`apps/sync/test/missingReasons.test.ts`) and the API Lambda's `LeadIndex` port (`apps/api/test/duckDbParquet.test.ts`).
- **Test data:** the sample manifest (`contract/v1/sample.parquet`, 35 permit rows) was queried directly and contains **zero** rows with `roof_age_basis = "unknown"` (the contract's actual missing-equivalent value — see the Assumptions terminology note). This is a genuine data-availability limit of this specific 35-row permits-only sample, not a defect. TC-006 therefore uses a fixture row with `roof_age_basis: "unknown"` and no permit history (same shape as the story's "parcel near Del Valle" example) rather than a live query against this sample. Re-run this case against a live query once a manifest containing such a row is available (e.g. the full-county manifest at the "S · Data switch" step).
- **Steps:**
  1. **Feed** `BuildIndex` the fixture row (`roof_age_basis: "unknown"`, `roof_age_years: null`) via `apps/sync/test/missingReasons.test.ts`.
  2. **Verify** the output `CrmProperty` row preserves `roofAgeBasis: "unknown"` exactly and `roofAgeYears: null` — never a guessed or interpolated number.
  3. **Query** the same shape via `apps/api/test/duckDbParquet.test.ts`'s `getProperty`/`searchProperties` fixtures; **verify** the port returns the identical `roofAgeBasis`/`roofAgeYears` values unchanged.
- **Expected result:** the exact missing-equivalent reason (`"unknown"`) is present at every layer (BuildIndex output and the API port); `roofAgeYears` is never a guessed or interpolated number.

### B-02-TC-007: No row in the index has an invented value where a `missing` reason was published (negative)

- **Priority / tags:** P1 · `@missing-data`
- **Maps to:** AC-3, FR-003
- **Target:** every property row written by `apps/sync/handlers/buildIndex.ts` across the sample-manifest index.
- **Note:** against this specific 35-row sample (which has zero `roof_age_basis = "unknown"` rows, per the Assumptions terminology note), this case passes vacuously — there is no row for it to find a violation in. It genuinely exercises the assertion once a manifest containing a missing-equivalent row is indexed (the fixture-based TC-006 proves the underlying preservation logic in the meantime).
- **Steps:**
  1. **Query** every property row in the sample-manifest index.
  2. **For each row** where a source field was published as `missing`, **verify** the corresponding index field is `null`/absent with the reason intact, never a non-null computed value.
- **Expected result:** zero rows found with a value where the source published `missing` instead.

### B-02-TC-008: Re-sync of an already-indexed manifest CID creates zero new S3 objects (happy path / idempotency)

- **Priority / tags:** P1 · `@smoke @idempotency`
- **Maps to:** AC-4, FR-004
- **Target:** the `crm-index` S3 bucket's object count and `apps/sync/handlers/fetchPart.ts`'s `If-None-Match` write path.
- **Preconditions:** TC-001 has completed; the manifest's parts are already in S3.
- **Steps:**
  1. **List** S3 objects under `crm-index/raw/{manifestCid}/`.
  2. **List** S3 objects under `crm-index/index/{manifestCid}/`.
  3. **Record** the combined total object count as N.
  4. **Trigger** the sync again against the same `manifestCid`.
  5. **List** the same two S3 prefixes again.
  6. **Record** the combined total object count as N'.
- **Expected result:** N' equals N exactly — zero new objects created.

### B-02-TC-009: A second concurrent execution for the same manifest CID is rejected (edge)

- **Priority / tags:** P2 · `@idempotency`
- **Maps to:** AC-4, FR-004
- **Target:** the `crm-sync` Step Functions state machine's execution-name uniqueness guard.
- **Steps:**
  1. **Start** a `crm-sync` execution with name = the manifest CID.
  2. **Immediately start** a second execution with the identical name, before the first completes.
- **Expected result:** the second `start-execution` call fails with `ExecutionAlreadyExists`; only one execution runs to completion for that CID.

### B-02-TC-010: Gateway politeness — ≤30 req/min, backoff+jitter on 429/5xx (NFR)

- **Priority / tags:** P2 · `@perf @negative`
- **Maps to:** NFR-002
- **Target:** `packages/config/gatewayPolicy.ts`'s token-bucket/backoff policy and `infra/lib/crm-sync-stack.ts`'s `FetchPartFunction` Distributed Map concurrency.
- **Fault injection method:** `packages/config/test/gatewayPolicy.test.ts`'s fake-clock token-bucket harness, and a Vitest-mocked `fetcher.fetch` returning 429 for `apps/sync/test/fetchPart.test.ts`'s retry-counting assertions — not live production traffic.
- **Steps:**
  1. **Verify** the Step Functions Distributed Map's `MaxConcurrency` for `FetchPart` is within the plan's allowed range of 2–3 (`plan.md`'s Operations row; deployed value is 3, per `infra/lib/crm-sync-stack.ts`'s `FETCH_PART_MAP_CONCURRENCY`).
  2. **Simulate** a gateway returning 429 for a `FetchPart` request via the mocked fetcher.
  3. **Verify** the retry uses exponential backoff with jitter (not a fixed delay).
  4. **Verify** the token bucket admits no more than 30 requests in any 60-second window per gateway (per-invocation limit — the documented known limitation that this is not a cross-invocation aggregate cap, per `docs/evidence/B-02.md`'s E2 fixer-round item 6).
  5. **Verify** after 5 exhausted retries on one gateway (not counting token-bucket waits, per the same fix), the fetch switches to the next gateway in order rather than retrying indefinitely.
- **Expected result:** Map concurrency is within 2–3 (deployed: 3); rate stays at or under 30 req/min per gateway per invocation; backoff is exponential with jitter, not fixed; gateway switch happens at exactly 5 real fetch attempts.

### B-02-TC-011: A part's bytes fail sha256 → quarantined, alarm fires, previous index still serves (edge, negative)

- **Priority / tags:** P1 · `@negative @edge`
- **Maps to:** Edge case 1 (stories/B-02-lead-index.md)
- **Target:** `apps/sync/handlers/fetchPart.ts`'s sha256 verification/DLQ routing and the `crm-sync-fetch-part-dlq-depth` CloudWatch alarm (`infra/lib/crm-sync-stack.ts`'s `FetchPartDlqAlarm`, on the `crm-sync-fetch-part-dlq` queue's `ApproximateNumberOfMessagesVisible` metric).
- **Fault injection method:** a Vitest-mocked `fetcher.fetch` returning bytes that don't match the manifest's declared sha256 for one part, for `apps/sync/test/fetchPart.test.ts`'s DLQ-routing assertion — not production traffic.
- **Preconditions:** a previously promoted run exists with `manifestCid = M_prev` and `indexInfo().manifestCid = M_prev`.
- **Steps:**
  1. **Trigger** a new sync run against a test manifest `M_test`, with one part's fetched bytes corrupted per the fault injection method above.
  2. **Verify** the `crm-sync` state machine's `CloudWatch Logs` record that part as failed verification.
  3. **Verify** the run's `index_meta.status` is `Held` (never `Validated`/`Promoted`) for `M_test`.
  4. **Verify** the `crm-sync-fetch-part-dlq-depth` alarm transitions to `ALARM` state once the part lands on `crm-sync-fetch-part-dlq`.
  5. **Query** `indexInfo()` immediately after.
- **Expected result:** `indexInfo().manifestCid` still equals `M_prev`, exactly as before the test run — the corrupted run (`M_test`) never promotes, even partially; the named CloudWatch alarm is in `ALARM` state until the held run is resolved.

### B-02-TC-012: Row count drop > 5% from the previous run → held for review (edge, negative)

- **Priority / tags:** P1 · `@negative @edge`
- **Maps to:** Edge case 2 (stories/B-02-lead-index.md)
- **Target:** `apps/sync/handlers/validate.ts`'s drop-hold check (`apps/sync/test/validate.test.ts`).
- **Steps:**
  1. **Simulate** `Validate` receiving a `BuildIndex` output whose property count is more than 5% below the currently promoted run's count (fixture, not a real Task A republish).
  2. **Verify** `index_meta.status` is set to `Held`.
  3. **Verify** `heldReason` is set to `"drop_over_5_percent"`.
  4. **Query** `indexInfo()`.
- **Expected result:** the pointer is never flipped for this run; `indexInfo()` still serves the prior count; the hold is visible for operator review (not silently promoted, not silently discarded).

### B-02-TC-NF-01: Sync duration ≤ 5 min for the sample-manifest-sized run (NFR)

- **Priority / tags:** P2 · `@perf`
- **Maps to:** NFR-001
- **Target:** the deployed `crm-sync` execution's wall-clock duration and `apps/sync/handlers/promote.ts`'s `SyncDurationMs` metric emission.
- **Preconditions:** TC-001 has not yet run against a fresh manifest (so the measured duration is a real end-to-end run, not a cache hit).
- **Steps:**
  1. **Record** the `crm-sync` execution's `startDate` (from `describe-execution`).
  2. **Trigger** the sync against the sample manifest CID.
  3. **Record** the execution's `stopDate` once it reaches `SUCCEEDED`.
  4. **Read** the `SyncDurationMs` metric emitted by the `Promote` step for this execution (CloudWatch Metrics, namespace `RoofingCrm`).
- **Expected result:** `stopDate - startDate` and the emitted `SyncDurationMs` both show ≤ 5 minutes (300,000 ms) for this 35-row sample run.

### B-02-TC-NF-02: Index cold load ≤ 3 s per sandbox per manifest (NFR)

- **Priority / tags:** P2 · `@perf`
- **Maps to:** architecture-constitution.md §10 ("Index cold load" row)
- **Target:** `apps/api/src/adapters/duckDbParquet.ts`'s `IndexColdLoadMs` emission around its per-manifest `/tmp` cache.
- **Preconditions:** a fresh Lambda sandbox (post-deploy or after a forced cold start) with nothing yet in `/tmp` for the current manifest.
- **Steps:**
  1. **Invoke** the API Lambda's `searchProperties({})` for the first time after a deploy (cold sandbox).
  2. **Read** the `IndexColdLoadMs` metric emitted around that first download-and-open path (CloudWatch Metrics, namespace `RoofingCrm`).
  3. **Invoke** the same query again on the same (now warm) sandbox.
  4. **Verify** the second invocation emits no `IndexColdLoadMs` value (cache hit, not a cold load).
- **Expected result:** the first invocation's `IndexColdLoadMs` is ≤ 3,000 ms; the second invocation records no cold-load metric at all.

### B-02-TC-NF-03: Sync duration ≤ 30 min for the full-county run (NFR)

- **Priority / tags:** P2 · `@perf`
- **Maps to:** NFR-001 (full-county threshold)
- **Target:** the deployed `crm-sync` execution's wall-clock duration and the `SyncDurationMs` metric, at full-county scale (Travis County TCAD roll, 493,246 accounts per A-01).
- **Preconditions:** the full-county manifest is published (Task A's A-11) and `DATA_MANIFEST_CID` is switched to it (the "S · Data switch" step, a config change only).
- **Steps:**
  1. **Record** the `crm-sync` execution's `startDate`.
  2. **Trigger** the sync against the full-county manifest CID.
  3. **Record** the execution's `stopDate` once it reaches `SUCCEEDED`.
  4. **Read** the `SyncDurationMs` metric emitted by `Promote` for this execution.
- **Expected result:** `stopDate - startDate` and `SyncDurationMs` both show ≤ 30 minutes (1,800,000 ms).
- **Status:** **gap-linked, not run** — the full-county manifest is not yet published (A-11 pending), so this case cannot be exercised at any scale yet. See § 10.

## 9. Edge cases

- Full-county scale (AC-2 at real scale) → deferred to the "S · Data switch" step; TC-004/TC-005 are re-run then, not re-written.
- The published manifest carries no explicit contract-version field (ARD-B §6 open item) → not separately tested here; the digest guard (vendored-package drift) is tested via `apps/sync/test/plan.digestGuard.test.ts` at the unit level, referenced but not duplicated as a QC case since it has no observable hosted-runtime behavior beyond "the sync holds," already covered by TC-011/TC-012's pattern.

## 10. Gap-linked cases (expected to fail until fixed)

| TC ID | Asserts | Gap | Defect |
| --- | --- | --- | --- |
| B-02-TC-004 | Full-county count reconciliation | Full-county manifest not yet published (A-11 pending) | Tracked in `docs/plan.md` EXT-01, not a defect — expected until the data switch |
| B-02-TC-001 | Execution reaches `SUCCEEDED` end to end | `Promote` fails with `ResourceNotFoundException`: `crm-leads` (B-07's table) does not exist yet in this environment | Architecturally deliberate per `docs/architecture-constitution.md` §9 and `tasks.md` T038/T042 — not a B-02 defect. `docs/evidence/B-02.md` "Known gap". Re-run once B-07 deploys `crm-leads`. |
| B-02-TC-002 | Every indexed row carries `sourceManifestCid`, queried live via the API Lambda | Precondition (TC-001 reaching `SUCCEEDED`) not met — `indexInfo()`/`searchProperties()` against the live deployed index return `INDEX_NOT_READY` until `Promote` completes | Same root cause as TC-001; `sourceManifestCid` presence is proven in the meantime at the unit level (`packages/index-schema`'s strict Zod schema, `apps/sync/test/buildIndex.test.ts`). Re-run live once B-07 deploys `crm-leads`. |
| B-02-TC-005 | `donphan`'s independent MCP count confirmation | Travis County, TX is not published to this environment's Elephant MCP index (only Jackson County, FL is) | Data-publication gap, not a B-02 defect. `docs/evidence/B-02.md` AC-2 section. Re-run once Travis County is published. |
| B-02-TC-009 | Second concurrent `start-execution` for the same CID is rejected | Proven via sequential reuse-rejection (the bare-CID-named execution is permanently blocked from reuse, `docs/evidence/B-02.md`), not a literal simultaneous-start race — Step Functions enforces execution-name uniqueness the same way in both cases, but a true concurrent-start race has not been separately triggered | Not a defect; re-run as a true concurrent test once `crm-leads` unblocks a full end-to-end rerun (T052) |
| B-02-TC-NF-01 | `SyncDurationMs` ≤ 5 min | The metric is only emitted by a successful `Promote`; `Promote` has not yet completed (same root cause as TC-001) | Not a defect; `docs/evidence/B-02.md` records the Plan→Validate wall time (~8s) as an interim data point, well under budget. Re-run once B-07 deploys `crm-leads`. |
| B-02-TC-NF-02 | `IndexColdLoadMs` ≤ 3s on a fresh Lambda sandbox | Never measured against a live, freshly-deployed sandbox in Phase D — only proven at the unit level (`apps/api/test/duckDbParquet.test.ts`'s cold-load-timeout and cold-load-race tests) | Not a defect, but genuinely not run live. Re-run against the deployed API Lambda the next time a cold invocation is observable (e.g. after the next redeploy). |
| B-02-TC-NF-03 | Sync duration ≤ 30 min at full-county scale | Full-county manifest not yet published (A-11 pending) — same deferral as TC-004. TC-NF-01 proves the mechanism (duration measurement) at sample scale only. | Tracked in `docs/plan.md` EXT-01, not a defect — expected until the "S · Data switch" step |

## 11. Execution log (filled in Phase 5)

| TC ID | Run date | Build (sha) | Result | Evidence | Defect |
| --- | --- | --- | --- | --- | --- |
| B-02-TC-001 | 2026-10-23 | `81cbcb2` (deployed) | FAIL | `docs/evidence/B-02.md`: execution `-dbg14` — Plan/FetchPart/BuildIndex/Validate all `SUCCEEDED`, CID+sha256 verification passed for every part, but the overall execution ended FAILED at `Promote` | Gap-linked, §10 — blocked on B-07's `crm-leads` table, not a B-02 defect |
| B-02-TC-002 | 2026-10-23 | `81cbcb2` (deployed) | BLOCKED | Precondition (TC-001 `SUCCEEDED`) not met — `indexInfo()`/`searchProperties()` against the live deployed index return `INDEX_NOT_READY` until `Promote` completes. `sourceManifestCid` presence is proven at the unit level instead (`packages/index-schema`'s strict Zod schema; `apps/sync/test/buildIndex.test.ts`) | Same root cause as TC-001 |
| B-02-TC-003 | 2026-10-23 | `f57624e` (unit-level, automation exception per §6) | PASS | `apps/sync/test/fetchPart.test.ts` (part of `pnpm -r test`'s 583/583 pass) | — |
| B-02-TC-004 | 2026-10-23 | `81cbcb2` (deployed) | PASS | `docs/evidence/B-02.md`: `propertyCount: 14` = `coverage.parcels_published: 14`, `reconcileDiff: 0` | — |
| B-02-TC-005 | 2026-10-23 | — | BLOCKED | `docs/evidence/B-02.md` AC-2 section — Travis County not published to the Elephant MCP index | Gap-linked, §10 |
| B-02-TC-006 | 2026-10-23 | `f57624e` (unit-level, fixture row — see Terminology note in §3) | PASS | `apps/sync/test/missingReasons.test.ts`, `apps/api/test/duckDbParquet.test.ts` | — |
| B-02-TC-007 | 2026-10-23 | `f57624e` (unit-level) | PASS | `apps/sync/test/buildIndex.test.ts`, `apps/sync/test/missingReasons.test.ts` | — |
| B-02-TC-008 | 2026-10-23 | `81cbcb2` (deployed) | PASS | `docs/evidence/B-02.md`: `crm-index` object count 26 before and after the `-dbg15` rerun | — |
| B-02-TC-009 | 2026-10-23 | `81cbcb2` (deployed) | PASS* | `docs/evidence/B-02.md`: the bare-CID-named execution is permanently blocked from reuse (sequential reuse-rejection proven; a literal simultaneous-start race not separately triggered) | Caveat noted, §10 |
| B-02-TC-010 | 2026-10-23 | `f57624e` (unit-level) | PASS | `packages/config/test/gatewayPolicy.test.ts`, `apps/sync/test/fetchPart.test.ts`'s retry-counter test. Known limitation: the token bucket resets per Lambda invocation, so NFR-002's cap is enforced per-invocation, not cross-invocation-aggregate (documented, `docs/evidence/B-02.md` E2 item 6) | — |
| B-02-TC-011 | 2026-10-23 | `f57624e` (unit-level) | PASS | `apps/sync/test/fetchPart.test.ts`'s DLQ-routing assertion, `infra/test/*dlq*` alarm-config synthesis tests. The live alarm's actual `ALARM`-state transition was not separately triggered in Phase D | — |
| B-02-TC-012 | 2026-10-23 | `f57624e` (unit-level) | PASS | `apps/sync/test/validate.test.ts`'s drop-hold assertions | — |
| B-02-TC-NF-01 | 2026-10-23 | `81cbcb2` (deployed) | BLOCKED | `docs/evidence/B-02.md`: `SyncDurationMs` never emitted (Promote incomplete); interim Plan→Validate wall time ~8s recorded, well under the 5-min budget | Gap-linked, §10 |
| B-02-TC-NF-02 | — | — | NOT RUN | Never measured live; unit-level cold-load-timeout/cold-load-race tests exist (`apps/api/test/duckDbParquet.test.ts`) but no live cold-sandbox measurement was taken | Gap-linked, §10 |
| B-02-TC-NF-03 | — | — | NOT RUN | Full-county manifest not yet published (A-11 pending) | Gap-linked, §10 |

---

## Gate G6: Test Case Approval

| # | Criterion | Status |
| --- | --- | --- |
| G6-1 | Every AC and every FR maps to at least one TC (§ 2 and § 7) | ☑ |
| G6-2 | Happy, negative, edge and missing-data paths covered | ☑ |
| G6-3 | NFRs have test cases with measurable pass criteria | ☑ |
| G6-4 | Every case is a complete sequence starting from the hosted URL | ☑ (adapted for a UI-less story: "the hosted URL" = the deployed Step Functions execution / API Lambda, per § Assumptions) |
| G6-5 | Negative cases state the exact message or rejection behavior | ☑ |
| G6-6 | Test data and environment documented, with real records | ☑ |
| G6-7 | Every TC traces to the story and a requirement | ☑ |
| G6-8 | AI pre-check (`developmentsupport-g6-precheck`): PASS | ☑ (user-ratified 2026-10-23 at G7 Round 2 — see below; the AI pre-check's literal reading of constitution Article XXII/"hosted URL" never returned a clean PASS for a no-UI story's Vitest-as-proof substitution and synthetic fixtures, which is exactly the judgment call this ratification makes) |

**Decision:** ☑ Approved · 2026-10-23 — the QC Lead (user) ratifies the no-UI automation substitution in § 6 (Vitest unit/contract tests as the accepted hosted-runtime proof; TC-006/TC-007/TC-012's synthetic fixtures standing in for a real published row this specific sample manifest doesn't contain) as adequate for this story's gate, at G7 Round 2.
