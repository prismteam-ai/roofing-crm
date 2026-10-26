# Specification Analysis Report: B-02 lead search index

Run 2026-10-23 against `spec.md`, `plan.md`, `tasks.md` (pre-fix versions), per `/speckit-analyze`. Read-only; no files modified by the analysis itself. Findings below were then fixed in `tasks.md` (see its Revision history) — this file is the permanent record of the analysis, referenced by `docs/gates/G5-B-02-precheck.md`'s C-10.

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| D1 | Constitution Alignment | **CRITICAL** | tasks.md (all phases); constitution.md Article VIII; plan.md Constitution Check row "VII–IX" | Article VIII ("Every Lambda uses Powertools Logger, Tracer and Metrics, with X-Ray on") and the NFR table's named metrics (`SyncDurationMs`, `IndexColdLoadMs`, `IndexManifestAgeHours`) had zero task coverage. | Add a Foundational task for shared instrumentation; amend every handler task to use it. **Fixed**: T010/T011 + amendments to T015, T019, T022, T024, T026, T030, T036. |
| D2 | Coverage Gap | HIGH | spec.md SC-005; tasks.md | SC-005/NFR-001 (sync duration thresholds) had no task that measures or asserts duration anywhere, including Phase Z. | Add a Phase Z task measuring `SyncDurationMs` against the threshold. **Fixed**: T045. |
| D3 | Coverage Gap | MEDIUM | architecture-constitution.md §11 (CI: `cdk synth --strict` with cdk-nag); tasks.md T039 (then T035) | The integration-check task runs vitest/typecheck/lint/format but not `cdk synth --strict` with cdk-nag. | Not fixed in this pass — left as a known, low-risk gap; cdk-nag can be added to T039 before Phase Z deploys if time allows. |
| D4 | Inconsistency (terminology) | LOW | stories/B-02-lead-index.md edge case "quarantined"; tasks.md FetchPart tasks | Story uses "quarantined"; tasks.md used "routes to the DLQ" for the same mechanism. | Not fixed — cosmetic, same mechanism either way. |
| D5 | Underspecification | LOW | tasks.md (BuildIndex missing-reason task) | Conditionally worded task ("if the prior task doesn't already satisfy this"). | Not fixed — intentional, both tasks touch the same file for the same story's refinement. |

**Coverage Summary (at time of analysis):** 12 requirements (FR+SC+NFR), 83% fully covered (10/12), the two gaps being D1/D2's underlying requirements (Article VIII indirectly, and SC-005/NFR-001 directly). Both now closed per the Revision history in `tasks.md`.

**Critical Issues Count at analysis time:** 1 (D1). **Resolved:** yes (D1, D2). **Deferred:** D3 (MEDIUM), D4/D5 (LOW) — left as-is, explicitly scoped out of this fix pass.
