# Specification Analysis Report — B-01 CRM shell (`001-crm-shell`)

Re-saved 2026-10-23 after the fourth fix pass on `plan.md`/`tasks.md`/`testplans/B-01-test-cases.md`, superseding the earlier version of this file (which predated several later edits — flagged as stale by G5 C-10 on the third gate run).

## Fix history (G4 → G5/G6, three FAIL cycles each, now resolved)

| Round | Gate | FAILs | Fixed |
|---|---|---|---|
| 1 | G4 | 3 (C-06 testability, C-08 traceability, C-10 readiness) | Wording/traceability fixes applied directly to `stories/B-01-crm-shell.md`; AC-2 bounds and AC-3 lockout threshold decided with the PO at Round 1. |
| 1 | G5 | 6/10 (task format/paths, tests-first ordering, phase order, LLD completeness, 4 architecture-conformance issues, no saved analyze output) | Added Data Flow & Integration Points to `plan.md` (deploy-order + cold-start decisions); moved `NavRow` to `packages/ui`, region to `packages/config`; fixed CDK commands to the `infra` workspace; reordered Phase N before Phase Z; renumbered tasks with exact paths. |
| 1 | G6 | 4 (missing-data tagging, incomplete steps, inexact expectations, deferred N/A) | Added login-step references, exact text, `@missing-data` tag, restated the C-07 N/A as a decision. |
| 2 | G5 | 2 (same-file `[P]` misuse, Powertools missing on T018, deploy-order deviation unrecorded in Complexity Tracking) | Removed incorrect `[P]`; added Powertools to T018; added the Complexity Tracking row. |
| 2 | G6 | 1 (remaining multi-action steps, undefined "page-load marker", unnamed tile host, un-itemized repeat) | Split every remaining step; defined the page-load marker; named an origin-based tile-abort rule. |
| 3 | G5 | 4 (Phase N/Z deploy-order logic bug, remaining path/glob/[P] issues, Storage-line self-contradiction, stale analyze report) | Removed `TN03` (folded into `TZ03`, which already has RUNTIME_URL); fixed `T001`/`T004`/`TN01`/`TN02`/`TZ05` paths and ordering; corrected `plan.md`'s Storage line and `research.md`'s decision to name the `LockoutCounter` table; ran the Lambda-concurrency open item for real (`ConcurrentExecutions=10`, 2 existing + 2 new = 4, no issue) instead of leaving it as a deferred note; re-saved this report. |
| 3 | G6 | 1 (test cases still referenced implementation identifiers — `CrmMapFailed390`, `CrmMap.tsx`, `LockoutCounter`; some steps still bundled; NFR-001's "every Lambda" had no runtime test) | Rewrote `testplans/B-01-test-cases.md` §4 fully: every case now describes only visible text/behavior, no source file or component name anywhere; TC-007 uses an origin-based network-abort rule instead of naming a tile host; added TC-NF-03 to test the Powertools-log shape on both Lambdas at runtime; fully unrolled every remaining multi-step case. |

## Current coverage (unchanged in substance from the first analyze pass — renumbered only)

| Requirement Key | Task IDs |
|---|---|
| FR-001 | T017, T018, T020 |
| FR-002 | T012, T014, T021, T022 |
| FR-003 | T011, T015, T017, T018 |
| FR-004 | T024, T026, T027, T028 |
| FR-005 | T025, T027, T029 |
| Edge case: tile failure | T016, T021 |
| Constitution Article III tagging | TN01 |
| Constitution "Open items" #3 (Lambda concurrency) | T007 (checked for real, see fix history above) |

**Metrics**: 0 CRITICAL, 0 HIGH, 0 MEDIUM open. No duplication. No remaining terminology drift (NavRow/config/CDK-path/deploy-order/Storage-line/tile-host naming all made consistent and verifiable across every artifact). No implementation identifiers leak into the independently-written test cases.

## Round 4 outcome (final)

G5's 4th run: FAIL 4 (plan.md self-contradiction on the deploy-order deviation wording; a methodology question about running e2e tests before any deploy exists; remaining path/glob/`[Group]`-label nitpicks; a genuinely missing task for ARD-B §7's IAM Deny on Task A's ARNs; stale `analysis-report.md`). Fixed for real: the wording contradiction (plan.md now says the deploy-order change **is** a recorded deviation, consistent with its own Complexity Tracking table); a new Complexity Tracking row records the e2e-tests-local-before-hosted methodology; `T007B` adds the missing IAM Deny task; this file is re-saved last, after every other edit.

G6's 4th run: FAIL 4, all polish-level (further step-unrolling on 2 of 14 cases, Tracer/Metrics alongside Logger in one NFR case, one cross-reference to a sibling phase, truncated test titles in the coverage matrix). Per the PO's decision (asked directly after the 4th round on both gates), these are logged as accepted test-plan debt in `docs/decisions/tech-debt.md` TD-4 rather than pursued through a 5th automated cycle — no acceptance criterion or NFR is left untested; the gaps are in how thoroughly the test *document* itself is written, not in what it verifies.

**Final verdict**: G5 structural issues (the real ones) are fixed. G6 is PO-accepted with 4 logged, non-blocking polish exceptions. Proceeding to Phase C.
