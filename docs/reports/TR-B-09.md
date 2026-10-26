---
id: QC-RPT-B-09
type: test-execution-report
feature: FEAT-B09, FEAT-B11
story: B-09
test_cases: testplans/B-09-test-cases.md
runtime_url: https://009-agent-hardening.d1zmhc6kkyzsbe.amplifyapp.com
build: CI and e2e at 731b481, golden pass 6 on the API at cbb548e (API unchanged since), web with the optimistic lead insert (7d483df)
data_snapshot: bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute (travis-full-run2-20261024)
owner: Claude (session), approved by HebaGaber
status: Draft (not signed off; open items listed below)
gate: G7
created: 2026-10-25
signed_off_date:
---

# QC Test Report: B-09 Grounded agent, production hardening, real-data switch, prototype re-audit (parts B-09 and B-11)

Run against the **hosted** preview, never localhost. The agent checks are `tests/agent/golden.test.ts` (rules in `tests/agent/passRules.ts`, prompts in `tests/agent/golden.json`) calling the deployed `agent.ask` and `agent.confirmLead` behind Cognito. The UI checks are the hosted Playwright suite in CI at 390, 768 and 1440. Raw golden results: `tests/agent/results/run2-pass1-2026-10-25.json` to `run2-pass6-g1-g2-g3-g5-g6-2026-10-25.json`.

Every Run 2 golden answer is either "answered with verified rows" or an **honest empty**, because only about 2 percent of Run 2 properties have a roof age. The pass rules accept an honest empty only with zero claims, citations and rows, matched 0, and the reason in structured fields. A pass on an honest empty is a pass on not inventing data, not a demonstration of rows. This report says which is which.

## Summary

| Item | Value |
| --- | --- |
| Environment | https://009-agent-hardening.d1zmhc6kkyzsbe.amplifyapp.com · commits as in `build` above · 2026-10-24 and 2026-10-25 |
| Total TC listed | 33 (test-case file version 0.2) |
| Passed / failed / deferred | 24 pass (most at API or unit level only, see the Results table) / 0 fail in the final state / 9 deferred or not proven (TC-002, TC-017, TC-019b, TC-021, TC-024, TC-NF-01 as specified, and the design-review sign-offs TC-022, TC-023, TC-023b) |
| Pass rate | Not stated as a single percentage. All 12 golden queries (G1 to G7, A1 to A5) have a passing result in their latest run (A1 pass 2, A2 to A5 pass 3, G4 pass 4, G7 pass 5, the rest pass 6), but they were reached through 6 passes with fixes between them (pass 1 passed 4 of 12) |
| Open Critical defects | 0 recorded; no Critical review finding open (see `docs/reviews/CR-B-09.md`) |
| Unit test report | no `docs/reports/UT-B-09.md` was written. The unit suites run in CI `workspace` |
| Code review log | `docs/reviews/CR-B-09.md`: final scores alakazam 84, ash 87, metagross 88, audino 82, porygon 84 (pass mark 75). Earlier scores 72, 62, 68, 72, 58, re-scored 80, 86, 84, 88, 88 |
| Playwright run | CI https://github.com/HebaGaber/roofing-crm/actions/runs/40167849532, green at 731b481. Jobs: gitleaks, `workspace` (1m24s), `e2e-hosted` (12m42s). Parallel phase 152 passed, 59 skipped (211 tests). Isolated phase 80 passed, 11 skipped. The workspace job log shows the unit suites passing. I did not total its unit test count |

Honest limits of those numbers: the skipped tests are not itemised in this report. `tests/e2e/responsive/layout.spec.ts` has an uncommitted edit in the working tree, so CI did not run that edit.

## Results

Type is the test-case file's type. "API" below means the deployed `agent.ask` harness, not a browser.

| TC ID | AC | Type | Result | Defect | Evidence |
| --- | --- | --- | --- | --- | --- |
| B-09-TC-001 | AC-1 | UI | PASS at API level (honest empty on Run 2; Ask-screen browser journey for G1 not run) | GAP-2, GAP-5 (earlier passes) | `docs/evidence/B-09.md` pass 6, G1: `empty_in_scope`, 3.9 s, Pflugerville city (30.447765, -97.602116), matched 0 equals index 0, 47,269 of 47,282 without a roof date |
| B-09-TC-001a | AC-1 | API | PASS (pass 2; not re-run after the later agent changes) | prompt wording defect ("downtown Austin" is not a gazetteer place) | `docs/evidence/B-09.md` pass 2, A1: `answered`, 12.6 s, 25 of 25 rows verified, matched 2,462 equals the index |
| B-09-TC-002 | AC-1 | UI | DEFERRED: no hosted test or evidence found for "Open on map" from an Ask answer | — | none. `ask.spec.ts` has no such test. The numbered answer pins and map wiring were built (commits `2c6478b`, `a7083c0`) but not proven by a recorded test |
| B-09-TC-003 | AC-1 | UI | PASS at API level (honest empty) | — | `docs/evidence/B-09.md` pass 6, G2: `empty_in_scope`, 1.9 s, area inherited from G1, contractor stated unsupported (`not_in_export`) |
| B-09-TC-004 | AC-2 | UI | PASS at API level | pass 4 undo and context defects (below) | `docs/evidence/B-09.md` pass 5: propose, `confirmLead`, `confirmLeads` created 2, `createdFrom: agent`. The Ask-screen confirmation card was not driven in a browser |
| B-09-TC-005 | AC-2 | API | PASS (unit test `apps/api/test/routers/agent.confirmLead.test.ts`, CI `workspace` green) | — | CI run 40167849532. I did not re-read the test's assertions for this report |
| B-09-TC-006 | AC-2 | UI | PASS at API level | — | `docs/evidence/B-09.md` pass 5: all 3 leads present in `leads.list`, `createdFrom: agent`. Detail-view provenance in a browser not run |
| B-09-TC-007 | AC-3 | UI | PASS at API level | — | `docs/evidence/B-09.md` pass 6, G6: `out_of_scope`, 1.4 s, zero claims, citations, rows, count 0 |
| B-09-TC-008 | AC-3 | UI | PASS at API level (reason is in structured fields: ZIP 99999 not a Travis ZCTA). Exact answer wording not quoted in evidence | — | `docs/evidence/B-09.md` pass 6 |
| B-09-TC-009 | AC-4 | API | PASS (G1, honest empty) | — | pass 6 |
| B-09-TC-010 | AC-4 | API | PASS (G2, honest empty; the plan read "many years" as 3 years, stated in its filters) | — | pass 6 |
| B-09-TC-011 | AC-4 | API | PASS (G3, honest empty: Manor's one old permit `1990-002676 BP` is stalled, the literal "open" reading is empty) | GAP-2 | pass 6, earlier FAIL in pass 2 (`needs_clarification`) fixed in `2856f42` |
| B-09-TC-012 | AC-4 | API | PASS (G4 `answered`, owner filter dropped and stated as `not_in_export`, 25 of 25 rows verified) | GAP-3 | pass 4, 5.2 s; pass 3 FAIL. The rule is unchanged; the answer text does not contain "outside the area", the flag is in `unsupported` |
| B-09-TC-013 | AC-4 | API | PASS (G5, permit `1981-001776 BP` cited 1 of 1, contractor and BBB not available) | GAP-1 | pass 6, 3.4 s; passes 1 and 2 errored (out of memory, then 28 s timeout), fixed by moving search into SQL (`a502aa3`) |
| B-09-TC-014 | AC-4 | API | PASS (G6) | — | pass 6, 1.4 s |
| B-09-TC-015 | AC-4 | API | PASS (G7 propose, confirm 1, confirm 2 more, list, undo all 3, list again) | GAP-5, lead repo missing from the Lambda context, Undo reserved word | pass 5, asks 10.6 s and 7.1 s |
| B-09-TC-NF-01 | AC-4 | API | DEFERRED: the specified run (13 asks times 3 repeats, 39 asks) was never made; repeats were set to 1 to limit Bedrock spend | GAP-4 (earlier) | see Non-functional results |
| B-09-TC-016 | AC-5 | UI | PASS in CI at 390, 768, 1440 for the specs that exist (Ask, Coming soon, layout, Leads shell, Map shell, Sign-in). Not itemised screen by screen against the 9-screen list in the test case | — | CI run 40167849532 |
| B-09-TC-017 | AC-5 | UI | DEFERRED / partial: the idle, working, out-of-scope and not-found or low-confidence states are in `ask.spec.ts`. The throttled and paused states have unit tests (TC-026, TC-027) but no recorded responsive run at three widths | — | `tests/e2e/responsive/ask.spec.ts` |
| B-09-TC-NF-02 | AC-5 | UI | PASS for the widths 390, 768, 1440 (token audit, no horizontal overflow) and, since T062, no-horizontal-scroll checks at 360, 600 and 1280 px (map, list, Leads, phone Filters sheet, AI panel; 14 cases, run on the hosted URL in CI) | — | CI run 40167849532; `docs/reviews/CR-B-09.md` audino note |
| B-09-TC-018 | AC-6 | Infra | PASS (manual, forced failure) | — | `docs/evidence/B-09.md` AC-6 table: OK to ALARM at 2026-10-24 21:25:50 UTC; `docs/evidence/img/B-09-T057-dlq-alarm.png`. Dashboard widget screenshot of the `RoofingCrm` dashboard in ALARM was not captured, only the alarm history and the depth image |
| B-09-TC-019 | AC-6 | Infra | PASS (manual) | — | queue drained 21:26:05, alarm back to OK 21:28:50 with no manual reset |
| B-09-TC-019b | AC-6 | Infra | NOT RUN (DEFERRED). Incidental observation only: the real DLQ failures from 2026-10-23 held the alarm in ALARM until the queue was purged on 2026-10-24, but that was not a designed test | — | `docs/evidence/B-09.md` |
| B-09-TC-020 | AC-7 | API | PASS (unit test `leadIndex.manifestCid.test.ts` asserts the Run 2 CID; sync evidence shows the promoted manifest equals it; every golden pass reports it). Map-page property count in the UI not checked | — | `docs/evidence/B-09.md` section "Run 2 sync" |
| B-09-TC-021 | AC-7 | Docs | DEFERRED to QC sign-off. The text is present: `.specify/memory/constitution.md` B1 and `docs/architecture-constitution.md` (data path, `DATA_MANIFEST_CID`, MCP optional) | — | documents named |
| B-09-TC-022 | AC-8 | Docs | DEFERRED to QC sign-off (`audino` and the QC Lead). `design/design-review-log.md` exists with Fixed and Deferred rows; I did not walk every row | — | `design/design-review-log.md` |
| B-09-TC-023 | AC-8 | Docs | DEFERRED to QC sign-off, same as TC-022 | — | `design/design-review-log.md` |
| B-09-TC-023b | AC-8 | Docs | DEFERRED to QC sign-off, same as TC-022 | — | `design/design-review-log.md` |
| B-09-TC-024 | edge | UI | DEFERRED: no hosted test of the "took too long" state. The server side was seen once: A5 returned `timed_out` at 23.7 s in pass 1 (the abort works); the Ask screen's `timed_out` state was not driven | GAP-4 | `docs/evidence/B-09.md` pass 1 |
| B-09-TC-025 | edge | UI | PASS at unit level (`placeResolver.test.ts`, CI green). Not run live with "Zzyzxville"; "downtown Austin" (score 0.58) was refused live in pass 1 | — | `docs/evidence/B-09.md` pass 2 notes |
| B-09-TC-025b | edge | UI | PASS at unit level ("Pflugervile" fuzzy case in `placeResolver.test.ts`). Not run live | — | CI run 40167849532 |
| B-09-TC-026 | NFR | API | PASS (unit `rateLimiter.test.ts`: 6th call rejected, `retryAfterSec`). Not exercised on the deployed API: the golden runs were paced to stay under 5 asks a minute | — | CI run 40167849532 |
| B-09-TC-027 | NFR | API | PASS (unit `spendCap.test.ts`: rejected before the model call). Not exercised live; the real counter reached 137.3 of 300 cents on 2026-10-25 | — | CI run 40167849532 |

## Non-functional results

| TC ID | NFR | Tool | Result | Actual | Threshold |
| --- | --- | --- | --- | --- | --- |
| B-09-TC-NF-01 (golden latency) | p95 under 20 s, max under 23.5 s | `tests/agent/golden.test.ts` on the deployed API, repeats 1 | **Not proven as specified.** Met in the passes that ran after the fixes, with a small n | pass 3: n = 7, p95 = max = 11.5 s. Pass 5: n = 2, max 10.6 s. Pass 6: n = 5, p95 = max = 3.9 s. Pass 1 (before the fixes): max 23.7 s (A5 timed out); pass 2: G5 28.4 s | p95 under 20 s |
| Groundedness | 100 percent of cited property CIDs resolve | `property.get` re-read of every cited row | PASS in the passes that cited rows | pass 3: 100 cited rows verified (4 queries times 25); pass 4: 25 of 25; pass 2: 25 of 25; pass 6: 1 of 1. No fabricated property, permit, contractor or BBB value in any answer | 100 percent |
| Count cross-check | answer matched count equals index count | `search.properties` | PASS where checkable | G1 0 equals 0; A1 2,462 equals 2,462; A5 1,350 equals the index for 2 mi around the ZCTA centre. Permit counts cannot be cross-checked through `search.permits` (size limit) | equal |
| B-07-TC-NF-01 on Run 2 (lead create to top of list, 20 creates per viewport) | p95 at most 2,000 ms | Playwright per animation frame, hosted, commit 731b481 | PASS, close to the limit | p95 1,844 ms (mobile-390), 1,621 ms (tablet-768), 1,642 ms (desktop-1440). Earlier runs at the same limit: 71c22d9 gave 1,883, 1,668 and 1,684 ms; 9fc1c08 gave 1.75, 1.84 and 2.03 s; 661e634 gave 2,167, 1,958 and 2,016 ms and failed. The check swings by about half a second between runs. The optimistic insert of a created lead into the Leads cache (7d483df) removes one round trip but did not move these CI figures much; the runner's network dominates. Server share is small (Lambda p95 122 ms over 734 invocations) | p95 at most 2,000 ms |
| Spend and rate limits | $3 a day, 5 asks a minute | `crm-agent-usage` counter | not breached | counter 137.3 cents after pass 6; no ask was rate limited or paused | 300 cents; 5 per minute |
| Responsive and tokens | no overflow, Atlas tokens only | Playwright, 390 / 768 / 1440 | PASS | see TC-016, TC-NF-02 | no violations |
| Index warm-up and cold start | cold start | local measurement only | **not re-measured on the deployed Lambda** | local 2.8 to 8.7 s cold, about 1 s warm (`docs/pending-items.md` section 5) | — |

## Defects

Defects of this story were tracked as test-case gaps (GAP-1 to GAP-5) and review findings, not as a numbered ERR list. Fix commits are taken from commit subjects; I did not diff each one.

| ID | TC | Severity | Status | Fix commit |
| --- | --- | --- | --- | --- |
| GAP-1 permit lookup scanned the whole county (out of memory at 1024 MB, then 28 s timeout, 6 MB response limit) | TC-013 | High | Closed (pass 6 G5 passes) | `a502aa3` (search in the database, Lambda 2048 MB), `0eab363`, `b817331` |
| GAP-2 plan step returned the whole sentence as the place | TC-011, TC-012 | High | Closed (passes 3 and 6) | `2856f42` |
| GAP-3 G4 returned an unqualified empty; owner location is `not_in_export` | TC-012 | High | Closed (pass 4) | `9fadfae` |
| GAP-4 ZIP 78701 radius ask timed out at 23.7 s; G5 28.4 s | TC-NF-01 | High | Closed for those asks (A5 8.8 s in pass 3) | `a502aa3`, `0eab363` |
| GAP-5 G7 not exercised | TC-015 | High | Closed (pass 5) | `86029e9`, `7b925eb` |
| Lead repo missing from the Lambda context, so the agent could not check or propose leads | TC-004, TC-015 | High | Closed | `86029e9` |
| `leads.undoCreate` failed on the real table, `sequence` is a DynamoDB reserved word; the in-memory fake did not enforce it | TC-015 | High | Closed (first successful undo in pass 5) | `7b925eb` |
| FetchPart returned the downloaded bytes, so the Run 2 sync hit `States.DataLimitExceeded` | TC-020 | High | Closed | `98960b6` |
| Whole-county search ran out of memory and exceeded 6 MB responses | TC-013, TC-NF-01 | High | Closed | `a502aa3` |
| Alarm sat in ALARM from 2026-10-23 unseen because `CrmSyncStack` never had `alarmEmail` set | TC-018 | Medium | Closed | review fix, `d81b380` |
| CR-B-09 findings 1 to 20 | — | 3 Critical, 13 Major, 4 Minor | Closed | `56222d5`, `d81b380`, `84a23be`, `d78de40` |
| Final-round findings: answer text used the cited-row count, lead marks vanished past 1,000 properties, Tab trap and Escape scope, pin names | TC-001, TC-016 | Major and Minor | Closed | `71b6e8a`, `cbb548e` |
| ERR-21 found by the PO on the preview | — | not stated here | Closed | `15f3ab9` |

## Deferred, not proven, and open decisions

1. **Not run as specified:** TC-NF-01 (39 asks, 3 repeats), TC-002, TC-017 (throttled and paused at three widths), TC-019b, TC-024 in the browser, and live runs of TC-025, TC-025b, TC-026, TC-027. TC-021, TC-022, TC-023, TC-023b await the QC Lead and `audino` sign-off.
2. **Honest empties dominate on Run 2.** G1, G2 and G3 pass as honest empties; they do not show a list of Pflugerville or Manor properties. Only the Austin variants and G4, G5 return rows. A1 was last run in pass 2; A2 to A5 in pass 3.
3. **G3 product question (open versus stalled).** G3 is empty because the agent reads "open" literally; Manor's one old permit (`1990-002676 BP`) is stalled. Whether "open" should include stalled permits is a product decision recorded for the PR, not decided.
4. **Run 3 handling is not built.** `docs/pending-items.md` section 1 describes it: verify the manifest, decide full listing or delta-only, switch `DATA_MANIFEST_CID`, refresh fixtures. Incremental chain-following (section 1.4) is deferred and is needed only if Run 3 is delta-only. If Run 3 fills `structure.roof_date`, G1 to G3 will start returning rows and the hard-coded Run 2 counts in tests and docs change.
5. **Task A data gaps** (`docs/pending-items.md` section 3): empty `structure.roof_date`, owner area class unknown, tenure missing for 33 to 72 percent of sampled properties, 51,900 properties without coordinates, all permits from the City of Austin with no resolved contractor, no BBB data.
6. **Deferred features** (`docs/pending-items.md` section 4, each needs an API or wire change): editable "Read as" chips and Widen chips, Cancel while working, low-confidence reason, Close-matches tab; map Area and Sort menus, pin explainer toast, permit coverage hatching, county outline, GPS explain-first card; leads multi-select status, Me / All reps, `leads.assign`, numbered pages, row signal snapshots, Changed pill, lineage links, deleted-lead state, place picker; sign-in lockout banner and session banners; conversation memory is one `THREAD#` item, not the full event store.
7. **Known small issues** (section 5): the Gateway AI provider is wired but off; `search.permits` returns at most 500 rows, longest open first, and the UI says so; every deploy starts one no-op sync; cold start on the deployed Lambda was not re-measured.
8. **Not done in this story:** release steps R1 to R7, the demo recording, the demo rehearsal, and retiring the `crm-ci` access (`docs/pending-items.md` sections 2, 6, 7).
9. **Follow-ups from review:** thread ids are client-supplied, the Gateway key is not refreshed after rotation, the reservation is kept if a Lambda times out mid-turn, `crm:alarmEmail` is committed, three `as unknown as` casts remain outside B-09 files, a Run 2 sync section was added only after the review.
10. **G7 gate:** this report does not approve G7. The user signs off.

## Substitutions and caveats to confirm

- Browser journeys for the Ask screen (TC-001, TC-003, TC-004, TC-006, TC-007, TC-008) were substituted by the same questions through the deployed API harness plus the hosted responsive specs. The harness checks answers and rows, not the rendered text.
- The `smeargle` agent was consulted for the design; whether it ran on the changed pages is not recorded in the files I read.
- The golden prompts for the Austin variants say "Austin", not "downtown Austin", after pass 1.
- CI covers commit 731b481, the head when this report was updated; later commits are documentation only.
