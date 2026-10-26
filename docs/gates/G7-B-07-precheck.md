---
gate: G7
artifact: docs/evidence/B-07.md
artifact_version: ae7768c (branch 007-leads; tested build cbb068f, no app code changed after it)
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G7 pre-check: B-07 Create, manage and browse CRM leads (parts B-07 and B-08)

This is an AI pre-check. It reports gaps only. It does not approve the gate; the PO records the decision.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Tasks done | PASS | `specs/007-leads/tasks.md`: 36 of 36 task lines checked (T001-T030, TZ01-TZ06). No `[ ]` left. |
| C-02 | Unit tests | PASS | `docs/reports/UT-B-07.md` attached. Latest CI run on ae7768c is green (workspace job). Every B-07 lead file is at 80% or more on statements, branches, functions and lines. Note: the report's CI link points to an older run (40076720899, on 2a2f669). Update it to run 40084514554. |
| C-03 | Code review | PASS (with caveat) | `docs/reviews/CR-B-07.md`: metagross 80, audino 78, /code-review medium run. Both at or above 75. 0 open Critical. Caveat: the scores were given on 67234b1, before the review fixes in 2a2f669. They were not re-scored. Finding 1 (High, client-trusted `create`) is deferred by PO decision, not Critical. |
| C-04 | TC executed on hosted URL | **FAIL** | Every executed TC has a hosted URL and build sha, and none ran on localhost. Two gaps: (a) B-07-TC-NF-03 and the TC-011 scale variant (AC-4 at 50+ leads) are recorded as "DEFERRED by the PO (not executed, not passed)" in `testplans/B-07-test-cases.md` §11 and `docs/evidence/B-07.md`. They have no result. This needs an explicit PO exception at G7. (b) `docs/reports/TR-B-07.md` does not exist. Only `TR-B-01.md` is present. The skill's inputs list the test report, so it is reported missing here. |
| C-05 | Defects closed | PASS | `docs/defects/ERR-1.md` to `ERR-20.md`: all Closed, each with a re-test line. Note: ERR-13 (TC-NF-01 unexplained 2.7 s failure) is closed as "not reproduced, cause unproven". ERR-12 covers the DNS (`ENOTFOUND`) failure on TC-007. |
| C-06 | No open Critical | PASS | No ERR with Critical severity is open. CR-B-07 reports 0 open Critical. |
| C-07 | Evidence | PASS | `docs/evidence/B-07.md` has the hosted URL, observed counts (136 passed, 17 skipped, 0 failed; TC-007 1 created and 19 refused), screenshots (20 `B-07-*.png` in `docs/evidence/img/`, spot-checked 6 present), and 3 X-Ray trace ids. |
| C-08 | Traceability | PASS | `docs/traceability.md` has B-07 rows (AC-8, D-6, R-2, D-8, AC-7 for B-08) with TC and evidence links. `docs/kit-usage.md` has B-07 and B-08 rows. The AC-4 scale and AC-5 "Run n" gaps are marked as deferred in both. |
| C-09 | Commits and secrets | PASS | All 50 commits in `feature/roofing-crm..007-leads` start with `B-07:`. Pattern scan of the B-07 diff found no key or secret. CI gitleaks job passed on ae7768c. |
| C-10 | Story status | PASS | `stories/B-07-leads.md` front matter is complete. `status: Ready` stays until the PO approves G7 and merges. This is the one expected open item. |

## Verdict

**FAIL.** 1 FAIL (C-04). C-04 fails on a deferred test case scope and on a missing test report.

## Fix list (ordered by impact on the assessment score)

1. **C-04, PO exception.** The PO must either grant the exception in writing for B-07-TC-NF-03, the TC-011 scale variant and AC-4 at 50+ leads (A-11 data moves to a later story), or run them before G7. The exception must be recorded at G7 by the PO. This pre-check cannot grant it.
2. **C-04, missing test report.** Create `docs/reports/TR-B-07.md` (as `TR-B-01.md` does for B-01), or ask the PO to confirm that `docs/evidence/B-07.md` is the accepted test report.
3. **C-02, stale link.** Point `docs/reports/UT-B-07.md` at the CI run for ae7768c (40084514554).
4. **C-03, re-score (recommended).** Ask metagross and audino to re-score the current head, since the scores predate the review fixes in 2a2f669. The first score must still be 75 or more.
5. **C-05, PO note.** ERR-13 is closed as "not reproduced, cause unproven". The PO should accept that in the gate decision.
6. **Process note.** The playbook's stage 6 names `smeargle` on changed UI pages. TZ04 substituted TC-NF-04 and the agent was not run. The PO should accept that substitution.

Nothing was edited, committed, pushed, deployed or run against AWS. Only this report was written.

## Resolution and decision (2026-10-24)

| Fix-list item | Outcome |
| --- | --- |
| 1. C-04 PO exception for TC-NF-03, TC-011 scale, AC-4 at 50+ | Granted by the PO (deferred to a later story with the A-11 data); recorded in `stories/B-07-leads.md` Gate G7 |
| 2. C-04 missing test report | Written: `docs/reports/TR-B-07.md` |
| 3. C-02 stale CI link | Fixed in `docs/reports/UT-B-07.md` (run 40084514554); CI is also green on the final commit |
| 4. C-03 re-score | Done: metagross 85, audino 86 (`docs/reviews/CR-B-07.md`) |
| 5. ERR-13 and 6. the `smeargle` substitution | Accepted by the PO |

**Decision:** Approved with exceptions, HebaGaber (PO), 2026-10-24.

