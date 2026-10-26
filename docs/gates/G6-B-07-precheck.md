---
gate: G6
artifact: testplans/B-07-test-cases.md
artifact_version: 0.1
run_date: 2026-10-24
tool: Claude
verdict: FAIL
---

# Gate G6 pre-check: B-07 Create, manage and browse CRM leads

Inputs read: `testplans/B-07-test-cases.md`, `stories/B-07-leads.md`, `specs/007-leads/spec.md`. `tasks.md` was not read.

| Check | Criterion | Result | Finding |
| --- | --- | --- | --- |
| C-01 | AC coverage | PASS | AC-1 (TC-001..004, NF-01), AC-2 (TC-005..007), AC-3 (TC-008..010), AC-4 (TC-011..013, NF-03), AC-5 (TC-014, 015) all mapped in § 2 and § 7. |
| C-02 | FR coverage | PASS | FR-001..005 and NFR-001 each mapped in § 2 to at least one TC. |
| C-03 | Path coverage | PASS | Happy: TC-001, 008, 011, 012. Negative: TC-005, 006, 009, 013, 017. Edge: TC-007 (20 concurrent), TC-010, TC-016 (empty list). Missing-data: TC-004, 014, 015. |
| C-04 | NFR tests | PASS | NFR-001 → TC-007 (exactly 1 success, 19 "Already a lead", 1 row, pass within 10 s). Latency → TC-NF-01 (p95 ≤ 2 s over 20 creates). TC-NF-03 (p95 < 3 s) is blocked by GAP-1, which is stated. Note: the NFR ID sequence skips NF-02; cosmetic. |
| C-05 | Complete steps | FAIL | Not every case is a complete sequence from the hosted URL. TC-006 step 1 reads "Repeat TC-005 steps 1–2". TC-015 step 1 reads "Open the stale lead as in TC-014". TC-004 relies on a lead "created as in TC-007 setup" or TC-001. Fix: write out the full steps (open `{RUNTIME_URL}`, log in as `{TEST_USER}`, tap, and so on) in TC-004, TC-006 and TC-015. Put shared setup in one named precondition helper and reference it by name in each case. |
| C-06 | Exact expectations | FAIL | TC-009 expects "save failed, change undone", and its own text says "see GAP-2 for final copy", so the expected message is not confirmed. TC-004 expects "Contractor not available" and TC-016 expects "no leads yet": both are wording the prototype only implies from screen titles. TC-013 says "shows the no-match message" in the steps without quoting it. Fix: confirm each string against the build or the design, quote it exactly in the expected result, and remove the "see GAP-2" placeholder from the expectation. Reserve the gap note for the execution log. |
| C-07 | Real test data | PASS | Real B-03 records used: `{P_5_52}`, `{P_AGE48}`, `{P_5_89}` with CIDs, and snapshot manifest CID `bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i`. Cleanup is described in § 5. Minor gaps: `{PM_28}` has no permit CID in this plan, and the Round Rock centre (lat/long) used by TC-011/TC-013 is not given. Fix both by adding them to § 5 before G6 sign-off. |
| C-08 | Independence | PASS | Cases derive from the story ACs, requirements and edge cases. `tasks.md` was not read. The B-03 test plan was used only for real property and permit identifiers. |
| C-09 | Automation mapping | PASS | Every P1 and P2 case in § 7 names a Playwright test (`B-07.spec.ts › "B-07-TC-00n …"`). The path is written without `tests/e2e/`; the template format is accepted. |

## Verdict

**FAIL** (2 checks fail: C-05, C-06).

## Fix list (ordered by impact on the assessment score)

1. **C-05.** Expand TC-004, TC-006 and TC-015 into full step sequences from `{RUNTIME_URL}`. Remove "as in TC-0xx" references.
2. **C-06.** Confirm the exact copy for save-failed, contractor-not-available, no-leads-empty and no-match states against the build, then quote them exactly in each expected result.
3. **C-07 (minor).** Add the `{PM_28}` permit CID and the Round Rock centre coordinates to § 5.
4. **Cosmetic.** Renumber NFR cases (NF-01, NF-03, NF-04: NF-02 is missing).

No change has been made to the artifact. Apply the fixes only if the user agrees.
