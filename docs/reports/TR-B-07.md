---
id: QC-RPT-B-07
type: test-execution-report
feature: FEAT-B07
story: B-07
test_cases: testplans/B-07-test-cases.md
runtime_url: https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com
build: web cbb068f, API 2a2f669
data_snapshot: bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i (travis-202609-permits-20261021t103516z)
owner: Claude (session), approved by HebaGaber
status: Complete
gate: G7
created: 2026-10-24
signed_off_date:
---

# QC Test Report: B-07 Create, manage and browse CRM leads (parts B-07 and B-08)

Run against the **hosted** preview, never localhost. The suite is `tests/e2e/B-07.spec.ts`, run on mobile 390, tablet 768 and desktop 1440.

## Summary

| Item | Value |
| --- | --- |
| Environment | https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com · web `cbb068f`, API `2a2f669` · 2026-10-24 |
| Total TC executed | 20 of 21 (the 21st, TC-NF-03, is deferred) |
| Passed / failed / blocked | 20 / 0 / 0, and 1 deferred by the PO |
| Pass rate | 100 % of executed cases (60 of 60 case-runs across 3 viewports in the first clean run; the final complete run of every story: 136 passed, 17 skipped, 0 failed) |
| Open Critical defects | 0 (ERR-2 Critical, Closed) |
| Unit test report | `docs/reports/UT-B-07.md` |
| Code review log | `docs/reviews/CR-B-07.md` |
| Playwright run | Local hosted runs recorded in `docs/evidence/B-07.md` (the B-07 spec skips on GitHub Actions: CI has no AWS credentials to clear its test leads; an organization policy blocks the GitHub-to-AWS role). CI on the final commit is green: https://github.com/HebaGaber/roofing-crm/actions/runs/40084514554 |

## Results

| TC ID | AC | Type | Result | Defect | Evidence |
| --- | --- | --- | --- | --- | --- |
| B-07-TC-001 | AC-1 | Happy path | PASS | ERR-5 | `docs/evidence/img/B-07-TC-001-*.png` |
| B-07-TC-002 | AC-1 | Happy path (permit row) | PASS | — | `docs/evidence/img/B-07-TC-002-*.png` |
| B-07-TC-003 | AC-1 | Snapshot | PASS | ERR-8 | `docs/evidence/img/B-07-TC-003-*.png` |
| B-07-TC-004 | AC-1 | Missing data | PASS | — | `docs/evidence/img/B-07-TC-004-*.png` |
| B-07-TC-005 | AC-2 | Negative | PASS | ERR-1 | `docs/evidence/img/B-07-TC-005-*.png` |
| B-07-TC-006 | AC-2 | Negative (data integrity) | PASS | — | `docs/evidence/img/B-07-TC-006-*.png` |
| B-07-TC-007 | AC-2 | Edge (20 concurrent) | PASS | ERR-4, ERR-12 | `docs/evidence/img/B-07-TC-007-*.png` |
| B-07-TC-008 | AC-3 | Happy path | PASS | ERR-10 | `docs/evidence/img/B-07-TC-008-*.png` |
| B-07-TC-009 | AC-3 | Negative (error handling) | PASS | — | `docs/evidence/img/B-07-TC-009-*.png` |
| B-07-TC-010 | AC-3 | Edge (1,000 chars) | PASS | ERR-6, ERR-10 | `docs/evidence/img/B-07-TC-010-*.png` |
| B-07-TC-011 | AC-4 | Happy path (sample, 3 leads) | PASS (scale variant DEFERRED by the PO) | — | `docs/evidence/img/B-07-TC-011-*.png` |
| B-07-TC-012 | AC-4 | Happy path (URL) | PASS | — | `docs/evidence/img/B-07-TC-012-*.png` |
| B-07-TC-013 | AC-4 | Negative (no match) | PASS | — | `docs/evidence/img/B-07-TC-013-*.png` |
| B-07-TC-014 | AC-5 | Missing data (stale fixture lead) | PASS | ERR-9 | `docs/evidence/img/B-07-TC-014-*.png` |
| B-07-TC-015 | AC-5 | Missing data (no stale values) | PASS | ERR-9 | `docs/evidence/img/B-07-TC-015-*.png` |
| B-07-TC-015b | AC-5 | Negative control | PASS | ERR-9 | `docs/evidence/img/B-07-TC-015b-*.png` |
| B-07-TC-016 | Edge | Empty state | PASS | — | `docs/evidence/img/B-07-TC-016-*.png` |
| B-07-TC-017 | FR-003 | Negative (unknown lead) | PASS | ERR-20 | `docs/evidence/img/B-07-TC-017-*.png` |

## Non-functional results

| TC ID | NFR | Tool | Result | Actual | Threshold |
| --- | --- | --- | --- | --- | --- |
| B-07-TC-NF-01 | Create to top of list | Playwright, per animation frame, 20 creates | PASS | p95 613, 590, 591 ms (3 viewports); API direct 413 to 534 ms; Lambda p50 / p95 / p99 17 / 80 / 249 ms | p95 at most 2000 ms |
| B-07-TC-007 (NFR-001) | Duplicate refused under 20 concurrent creates | Playwright, real DynamoDB | PASS | 1 created, 19 "Already a lead", 1 row, 0 lost updates (3 viewports) | exactly 1 winner |
| B-07-TC-NF-04 | Responsive and tokens | Playwright token audit, overflow check | PASS | 390 / 768 / 1440: no horizontal scroll, Atlas tokens only | no violations |
| B-07-TC-NF-03 | List and map load with 50+ leads | not run | **DEFERRED by the PO** | needs the A-11 full-county data (`specs/007-leads/known-gaps.md` § 1) | p95 under 3 s |

## Defects

| ERR | TC | Severity | Status | Fix commit |
| --- | --- | --- | --- | --- |
| ERR-1 | TC-005 | High | Closed | `dabca22` |
| ERR-2 | TC-001 | Critical | Closed | `0f1a7a1` |
| ERR-3 | TC-001 | High | Closed | `1a02b12` |
| ERR-4 | TC-007 | High | Closed | `7eb800d` |
| ERR-5 | TC-NF-01 | High | Closed | `38e6eea` |
| ERR-6 | TC-010 | Medium | Closed | `07ec124` |
| ERR-7 | TC-NF-04 | Medium | Closed | `9c25cb4` |
| ERR-8 | TC-003 | High | Closed | `67234b1` |
| ERR-9 | TC-015b | High | Closed | `67234b1` |
| ERR-10 | TC-008, TC-010 | Medium | Closed | `294bf63` |
| ERR-11 | TC-NF-01 | Low | Closed | `6e1a163` |
| ERR-12 | TC-007 | Low | Closed | `4ee8e45` |
| ERR-13 | TC-NF-01 | Low | Closed | `60ad4d2` |
| ERR-14 | B-01 TC-004 | High | Closed | `734da50` |
| ERR-15 | B-03 perf | High | Closed | `1c8d151` |
| ERR-16 | B-02 unit | Medium | Closed | `1c8d151` |
| ERR-17 | B-03 TC-006 | High | Closed | `6ae4266` |
| ERR-18 | B-03 perf | Low | Closed | `6ae4266` |
| ERR-19 | responsive audit | Medium | Closed | `46259f5` |
| ERR-20 | TC-017 | Medium | Closed | `cbb068f` |

## Deferred by decision of the PO (2026-10-24), not passed

AC-4 at 50 or more leads, TC-011 scale variant and TC-NF-03. They need the full-county manifest from A-11, which moves to a later story. G7 can accept them only as an explicit PO exception.

## Substitutions and caveats to confirm

- The responsive check (task TZ04) uses TC-NF-04 at three viewports; the separate `smeargle` agent was not run because it would repeat that test.
- ERR-13 (one unexplained TC-NF-01 failure) is closed as **not reproduced, cause unproven**.
- TC-014 and TC-015 (AC-5) use a deliberately stale fixture lead because no second published run exists yet.
