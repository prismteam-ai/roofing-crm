# CR-B-02: Review round — lead search index

Branch `002-lead-index`, diff against `feature/roofing-crm`. One round: `/code-review medium` + five read-only kit-agent reviewers (espeon, alakazam, machamp, porygon, donphan), all Sonnet, parallel, per [WALKTHROUGH-B-02-lead-index.md §3 Phase E](../../../assessment-guide/WALKTHROUGH-B-02-lead-index.md).

## Scores

| Reviewer | Angle | Score (Round 1) | Score (after E2) | Score (after convergence, `1a86a3d`/`f57624e`) | ≥75 |
| --- | --- | --- | --- | --- | --- |
| espeon | INDEX (Plan/BuildIndex/Validate/Promote, schema, local prototype) | 80 | — | **90** | ✅ |
| alakazam | Retrieval/index design, provenance, missing-data | 76 | — | **90** | ✅ |
| machamp | Batch workflow: queue/DLQ/backoff/cost-gate/idempotency | 70 | **86** | 86 (unchanged — convergence round touched `plan.ts`/`duckDbParquet.ts`, outside machamp's SYNC angle) | ✅ |
| porygon | Metrics/count-reconciliation trustworthiness | 58 | **82** | 82 (unchanged — convergence round didn't touch `promote.ts`/count-reconciliation logic) | ✅ |
| donphan | Oracle/Atlas access boundary + MCP cross-check | 88 | — | **91** | ✅ |

Two reviewers were under 75 after Round 1 (machamp, porygon). The E2 fixer (commit `06a25c1`) resolved every in-scope finding; both were re-scored directly against the fixed code (not the evidence doc's prose) and now pass. A later `/speckit-converge` fixer round (`1a86a3d`, `f57624e`) changed `apps/sync/handlers/plan.ts` (manifest-bytes-against-own-CID verification; SSM/`runs/index.json` authoritative CID resolution) and `apps/api/src/adapters/duckDbParquet.ts` (Powertools wrapping) after the original E1 scores — espeon, alakazam and donphan (whose review angles cover exactly those files) were re-scored directly against the current code; machamp and porygon's angles (SYNC batch mechanics, count-reconciliation) weren't touched by that round, so their E2 scores stand unchanged. **All five reviewers ≥75 — E1/E2/convergence re-score complete.**

### Convergence re-score notes (2026-10-23)

**espeon (80→90):** both original findings (propertyCount persistence, SQL escaping) confirmed fixed by direct code read. The convergence round's two additions — manifest-CID verification and SSM/runs-index authoritative resolution — both fail closed (`Held`, never an uncaught throw) and strengthen exactly the provenance axis this review covers. Not higher: the cold-load race fix's attempt-counter mechanism is correct but not independently re-run by this reviewer.

**alakazam (76→90):** both original findings confirmed fixed, verified directly (not from the evidence doc). The convergence round's manifest-CID check and SSM/runs-index fallback chain are both genuine completeness fixes with sensible fallback behavior. Not higher: the three-deep fallback chain (SSM → runs-index → hint) only logs on disagreement rather than alerting, noted as a future improvement, not a current defect.

**donphan (88→91):** AC-2's MCP cross-check remains blocked (Travis County not published) — unchanged, still honestly disclosed. The convergence round's manifest-CID verification and SSM/runs-index resolution are real provenance/correctness improvements, fail-closed, no new access-boundary issues. Not higher: the one gap this reviewer's score reflects (the MCP cross-check) is still open and outside this round's scope.

### E2 re-score notes

**machamp (70→86):** confirmed live — CloudFront now genuinely first in `manifestGatewayUrls()`/`GATEWAY_PART_PATH` with correct path-shape handling; `plan.ts` calls `costGate.ts` directly, dead duplicate gone; FetchPart's `attempt` counter only increments on a real fetch, bucket-waits tracked separately, proven by a new test; the per-invocation (not cross-invocation) token-bucket limit is honestly documented rather than claimed as NFR-002-compliant at the aggregate level. Residual: scraping scripts (#5, out of scope by decision) and Promote's still-pending live B-07 dependency — both pre-existing disclosed items, not new deviations.

**porygon (58→82):** confirmed live — Promote's `UpdateCommand` now writes `propertyCount`/`permitCount`/`promotedAt`; the new `promote.test.ts` genuinely proves Validate reads a real prior count (not just that the write occurs); `duckDbParquet.ts`'s `indexInfo()` now reads real values. AC-2's MCP cross-check framing is still honestly stated as a disclosed data-publication gap, not overstated as resolved. Residual, not a regression: the propertyCount round-trip is still only unit-proven (mocked DynamoDB), not live-proven — blocked on B-07's table, same disclosed cross-story dependency as before.

## Findings, deduplicated across all six sources

Independently confirmed by ≥2 sources are marked **[confirmed]**; verified directly against the code in this review session are marked **[verified]**.

### Critical — must fix before E2 re-score

1. **[confirmed][verified] `Promote` never persists `propertyCount` to `META#index`.** `apps/sync/handlers/promote.ts:54` only writes `#current`/`#previous`. `apps/sync/handlers/validate.ts:192` reads `pointer.Item?.propertyCount`, always `undefined` → `null`, so the documented >5%-row-drop-hold safety check (SC-006) can never fire in production. `apps/api/src/adapters/duckDbParquet.ts:120` (`indexInfo()`) reads the same missing field and will always report `propertyCount: 0`. — code-review, porygon, alakazam, espeon (indirectly).

2. **[confirmed][verified] ADR-02's gateway order is not what's deployed.** ADR-02 specifies CloudFront copy first, then Filebase, then Pinata. `infra/lib/crm-sync-stack.ts:210-211` only sets `GATEWAY_FILEBASE_BASE_URL`/`GATEWAY_PINATA_BASE_URL` — no `GATEWAY_CLOUDFRONT_BASE_URL` anywhere in the stack, and `apps/sync/handlers/plan.ts`'s `GATEWAYS` list omits CloudFront entirely. Confirmed by grep: no CloudFront env var exists in the deployed stack. This is an unlogged deviation from a recorded ADR, not a config gap. — machamp, confirmed directly in this review session.

3. **[confirmed] Dead, diverging cost gate.** `apps/sync/handlers/costGate.ts`'s `estimateCostFromManifest`/`evaluateCostGate` (`COST_PER_GB_USD = 0.09`, ≈8.4e-11 USD/byte) is never called from `Plan` or the state machine — only from its own tests. `plan.ts:34` reimplements its own inline `USD_PER_BYTE = 5e-10` (~6x stricter) and its comment incorrectly claims `costGate.ts` is the authoritative, wired-in gate. The two will silently drift. — code-review, machamp.

### High

4. **[verified] Unescaped SQL string interpolation for `propertyCid`.** `apps/api/src/adapters/duckDbParquet.ts:206,227,236` interpolate `propertyCid` into DuckDB SQL without escaping, unlike `propertyUsageType` (line 192) which does escape quotes in the same diff. — code-review, espeon.

5. **Access-boundary violation in two vendored scripts.** `packages/oracle-views/scripts/build-gazetteer.ts` scrapes `census.gov` directly; `packages/travis-austin@1.0.0/scripts/socrata.ts` scrapes Austin's Socrata portal. CLAUDE.md: "No scraping, no ingestion, no access to Oracle's internal stores." Both survived vendoring and are inconsistent with the same pass's own removal of `a01-us-gis-probe.yml`/`a04-gis-capture.yml` for the same reason. — code-review.

6. **`FetchPart`'s retry loop burns retries on a throttled wait, never a real fetch.** When the per-gateway token bucket is exhausted, the loop `continue`s without calling `fetcher.fetch()`, consuming one of `MAX_RETRIES_BEFORE_SWITCH` attempts purely on backpressure. Compounded by token buckets being constructed fresh per Lambda invocation (`createGatewayTokenBuckets()` inside the handler), so the ≤30 req/min-per-gateway cap (NFR-002) never observes the real aggregate rate across the Map's concurrent invocations. — code-review (machamp's review asserted this cap is enforced; it verified concurrency bound but not the per-invocation bucket reset — treating as unresolved, not contradicted).

7. **Three independent re-implementations of the same S3-download helper** (`buildIndex.ts:233`, `validate.ts:137`, `duckDbParquet.ts:173`) — drift risk on error handling. — code-review.

8. **Orphaned cold-load race in the API adapter.** `duckDbParquet.ts`'s `ensureLoaded` races `coldLoad()` against a timeout but never cancels the loser; an abandoned `coldLoad()` keeps writing to the same on-disk path a fresh retry will also use. — code-review.

### Disclosed gaps (not defects — already documented in `docs/evidence/B-02.md`)

- AC-2's independent MCP cross-check (`donphan`) could not run: Travis County is not published to this environment's Elephant MCP index (only Jackson, FL is). Re-confirmed live in this review round by donphan. Mechanism is built correctly; nothing to compare against yet.
- `Promote` has never completed end-to-end against live AWS — blocked on B-07's not-yet-created `crm-leads` table, a documented cross-story dependency (architecture-constitution §9). `SyncDurationMs` and the real conditional-write path are therefore unit-tested but not live-proven.
- The 0.1% full-county tolerance and the 30-min full-county NFR-001 budget are unproven at sample scale (14 rows) — deliberately deferred to the "S · Data switch" step per spec.md Assumptions.
- The execution-name-is-the-manifest-CID collision guard is operator convention today, not infra-enforced — fine pre-trigger, flagged for whichever later story adds an automated trigger.

## Disagreements between reviewers

None material. All five converge on the `Promote`/`propertyCount` bug and on AC-2's cross-check being blocked by data availability, not a defect. machamp is the only reviewer to catch the ADR-02 gateway-order drift; porygon is the only one to characterize AC-2's reconciliation as "not actually independent" by spec wording rather than "not yet run" — both readings agree on the underlying fact.

## Scope for E2 (fixer)

Fix, in this order: #1 (propertyCount), #2 (ADR-02 CloudFront wiring), #3 (wire the real cost gate, delete the dead duplicate), #4 (SQL escaping), #6 (token-bucket sharing + retry accounting), #7 (extract shared download helper), #8 (cancel/guard the orphaned cold-load). Re-score only machamp and porygon.

**#5 (scraping scripts) — user decision (2026-10-23): recorded as a known issue in `docs/evidence/B-02.md`, not fixed in this story.** Out of E2's scope.
