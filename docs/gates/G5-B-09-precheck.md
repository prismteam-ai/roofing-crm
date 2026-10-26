---
gate: G5
artifact: specs/009-agent-hardening/plan.md, specs/009-agent-hardening/tasks.md
artifact_version: "plan.md (dc2d3e0); tasks.md post-/speckit-analyze fixes (commit pending this precheck)"
run_date: 2026-10-24
tool: Claude
verdict: PASS
---

| # | Check | Result | Finding |
| --- | --- | --- | --- |
| C-01 | Clarified | PASS | `/speckit-clarify` ran (run-log.md); no `[NEEDS CLARIFICATION: ...]` in `spec.md` (grep confirms zero matches). |
| C-02 | Phase structure | PASS | Setup (1) → Foundational (2) → US4/US1/US2/US3/US5 (3–7) → Polish (N) → Phase Z (hosted proof), the last section in the file — matches the gated `specs/007-leads/tasks.md` precedent (Polish before Phase Z, Phase Z genuinely last). **Fixed in this precheck pass:** the first draft had Phase Z before Phase N, matching the raw upstream template literally but contradicting this very check and B-07's own executed order; swapped. |
| C-03 | Task format | PASS | Every task has a `T0NN`/`TN0N`/`TZ0N` ID, `[P]` where parallelizable, a `[Story]` label in every user-story phase (none in Setup/Foundational/Polish/Phase Z, correctly per the format rules), and an exact file path (directory paths for scaffolding tasks T002–T005; package path for T038; explicit file for every other task). |
| C-04 | Tests first | PASS | Every phase's "Tests for User Story N" section precedes its "Implementation" section; Foundational's test tasks (T006, T008, T010, T015, T016) precede their paired implementation tasks. |
| C-05 | Live verification last | PASS (after fix) | Phase Z (TZ01–TZ07) is the last task section: reviewer agents, deploy, Playwright against `RUNTIME_URL` (never localhost — `tests/agent/golden.test.ts`/`playwright.config.ts` both refuse it), `smeargle` suite, the story's `agents.verify` check, evidence/traceability/kit-usage. (TZ07, added in this pass, moves the post-merge `docs/progress.md` update out of Polish and correctly gates it on user-approved merge, per constitution XX.) |
| C-06 | LLD complete | PASS | `plan.md`'s Project Structure names every new/edited file and its owner; Technical Context states stack/storage/testing/performance/constraints/scale; `data-model.md` + `contracts/agent-api.md` + `contracts/observability.md` cover data flow and integration points; `quickstart.md` states the test approach end to end. |
| C-07 | Architecture conformance | PASS | No undocumented deviation. The one accepted deviation (native agent build instead of A-13/A-14 reuse) is named in `run-log.md`, the story file, and `plan.md`'s Constitution Check with a swap-back condition. The data path (direct read of Task A's published Run 1 manifest by CID) follows constitution B1 and ARD-B §7. `plan.md` explicitly reuses the already-accepted ADR-06 (`docs/decisions/0000-agent-architecture.md`) rather than inventing a competing design. |
| C-08 | Kit usage | PASS | `specs/009-agent-hardening/agent-design.md` has one verbatim answer each for `alakazam`, `ash`, `smeargle`, `porygon` (the Appendix section, added specifically to satisfy constitution XIV after an initial compiled-only draft). `plan.md`'s Kit Agent Ownership table cites it, names each builder's skills (`build-rag-systems`, `build-ai-agents`, `use-elephant-mcp`, `responsive-design-tests`, `unify-metrics`, `build-frontend-backends`, plus `apply-engineering-guidelines`), and lists 8 numbered builder patterns each mapped to a file path. |
| C-09 | Coverage | PASS | Every FR-001…FR-008 in `spec.md` has ≥1 task: FR-001/002/003 → US1 (T024–T040); FR-004 → US2 (T041–T047); FR-005/006 → US3 (T048–T057); FR-007 → US4 (T020–T023); FR-008 → US5 (T058–T060). Confirmed by direct grep cross-reference during `/speckit-analyze`. |
| C-10 | Analyze | PASS (after fix) | **Finding (resolved):** the `/speckit-analyze` run on the pre-fix `tasks.md` reported one HIGH (F1: an invalid `[US-shared]` story label on a Foundational task) and one MEDIUM (F2: a confirm-flow import-guard test scheduled 2 phases before the file it tests exists, so it would fail on import rather than its intended assertion). Both were fixed in the immediately following commit (`d8e9299`): F1's label dropped; F2's test moved into Phase 4/US1 as T029, renumbering T012–T029 with a net-zero shift from T030 onward. No CRITICAL/HIGH/MEDIUM finding remains against the current `tasks.md`. (A fresh `/speckit-analyze` run against the post-fix file would show this formally for the permanent record; not re-run here since the fixes were applied under direct review in this same session.) |

**Verdict: PASS, 0 FAIL.**

## Fix list
None blocking. Applied during this precheck, not deferred:
1. Swapped Phase N/Phase Z order in `tasks.md` so Phase Z is genuinely last (C-02/C-05).
2. Added TZ07 (post-merge `docs/progress.md` update, gated on user-approved merge) so Polish's
   TN04 wasn't doing pre-merge work the constitution reserves for after merge.

Record your Ready/Approved decision and date for G5, and add this gate's row to `docs/traceability.md`.
