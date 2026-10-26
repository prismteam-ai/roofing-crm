---
gate: G6
artifact: testplans/B-09-test-cases.md
artifact_version: "0.2 (real Run 2 test data filled in; golden pass rules set to what the data supports)"
run_date: 2026-10-25
tool: Claude (developmentsupport-g6-precheck criteria, checked by hand)
verdict: PASS
previous_verdict: "FAIL on C-07 (2026-10-24, placeholders waiting for Run 2)"
---

This is a pre-check report only. The product owner approves or rejects G6.

| # | Check | Result | Finding |
| --- | --- | --- | --- |
| C-01 | AC coverage | PASS | Unchanged from v0.1: AC-1 to AC-8 each map to at least one case (§ 2). TC-001a (Austin variant of AC-1) added. |
| C-02 | FR coverage | PASS | FR-001 to FR-008 each map to at least one case (§ 2). |
| C-03 | Path coverage | PASS | Happy (TC-001, TC-001a, TC-004), negative (TC-007, TC-025, TC-025b, TC-026, TC-027), edge (TC-019b, TC-023b, TC-024) and missing-data cases (honest empty for Pflugerville in TC-001, contractor and BBB not available in TC-009 to TC-015, owner location not published in G4) are all present. |
| C-04 | NFR tests | PASS | NFR-001 keeps measurable thresholds (23 s abort, 5 asks a minute, 3 dollars a day, p95 under 20 s). TC-NF-01 now says to report n, because with fewer than 20 samples the p95 equals the maximum. |
| C-05 | Complete steps | PASS | Unchanged. § 6 now defines `{RUNTIME_URL}` and `{TEST_USER}` as the two environment parameters (hosted branch-preview URL, seeded admin with the password taken from Secrets Manager into the environment only). |
| C-06 | Exact expectations | PASS | The golden group (TC-009 to TC-015) now states a concrete expected outcome per query on Run 2 (answered with verified rows, or honest empty with zero claims, citations and rows and the reason stated), and the matched count must equal the index's own count. |
| C-07 | Real test data | PASS | Every `{P_...}` and `{PM_REAL}` token is replaced with a value read from Run 2 (§ 5): permit `1981-001776 BP` (stalled, 16,516 days open) with its permit and property CIDs; open permit `1989-010586 BP`; Austin property TCAD `194401` (roof 33 years, basis permit, from `1992-000408 BP`); three lead-create properties (`194401`, `194348`, `194346`); ZIP 78701 with its centre; exact county overview and radius counts; Manor and Lakeway permit facts. Provenance recorded: run `travis-full-run2-20261024`, manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, read on 2026-10-25 through the deployed API and the published parquet parts fetched by CID. No placeholder data token remains. One requested item does not exist in the data: there is no ZIP filter (postal code is `not_in_export`), so a ZIP is a radius around the ZCTA centre, and § 5 says so. |
| C-08 | Independence | PASS | Unchanged: drafted from the story and spec; tasks.md not used. The Run 2 values were read from data, not from the build. |
| C-09 | Automation mapping | PASS | Every case names its test. The golden group maps to `tests/agent/golden.test.ts` (live run, skip-guarded without `RUNTIME_URL`) and its always-on pass-rule unit tests (21 tests pass locally). |

**Verdict: PASS, 0 FAIL.**

## Notes for the approver

1. The test plan now records five gaps found by the first real run on Run 2 (§ 10, GAP-1 to GAP-5; evidence in `docs/evidence/B-09.md`). They are defects in the product, not in the plan: the permit-number lookup runs out of memory or times out (G5), place extraction is unreliable on repeats (G3, G4), the p95 latency target is not met, and G7 has not yet been exercised on Run 2. Four of twelve first-pass results passed; the plan correctly expects those cases to fail until fixed.
2. Expectations in the plan reflect the data, not the assessment's hopes: only about 2 percent of properties have a roof age, so the Pflugerville, Manor and Lakeway prompts can pass only as honest empties or flagged answers, and the Austin variants carry the "real rows" proof. Nothing was loosened for honesty checks: any fabricated row, contractor or BBB value, any wrong place, or any ungrounded citation still fails.
3. The Austin variant prompts say "Austin", not "downtown Austin": the gazetteer has no sub-city places and refusing "downtown Austin" is correct behaviour.
4. Add this gate's row to `docs/traceability.md` once you decide.
