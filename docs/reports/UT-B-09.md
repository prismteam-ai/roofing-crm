---
id: UT-B-09
type: unit-test-report
story: B-09
branch: 009-agent-hardening
commit: 731b481
ci_run: https://github.com/HebaGaber/roofing-crm/actions/runs/40167849532
created: 2026-10-25
---

# Unit and Integration Test Report: B-09 Agent and hardening (parts B-09 and B-11)

The CI `workspace` job (type-check, lint, prettier, unit tests, `cdk synth --strict`) passed on commit `731b481`: https://github.com/HebaGaber/roofing-crm/actions/runs/40167849532 . The per-package totals below are from a local run of `vitest run` in every package on the same code plus the later commits `062cbae` to `cd4f0c8` (docs, tasks, e2e checks) and one new unit test file section for the lead service. `pnpm exec eslint .` and `pnpm exec prettier --check .` are clean.

| Item | Value |
| --- | --- |
| Command | `pnpm exec vitest run` in each package (coverage: `--coverage.enabled=true --coverage.reporter=text`) |
| Suites / tests | 179 test files passed (+4 skipped) / 1,743 tests passed |
| Passed / failed / skipped | 1,743 / 0 / 20 skipped (15 opt-in performance cases in `@crm/api`, 5 inherited in `@crm/oracle-views`) and 1 todo |
| Coverage of new and changed code | **Met** (see below) |

## By package

| Package | Files | Tests | Notes |
| --- | --- | --- | --- |
| `@crm/api` | 54 (+3 skipped) | 414 (+15 skipped, 1 todo) | agent (plan, compose, claim check, citation check, place scan, unpublished filters, answer notes), spend guard, confirm flows, SQL search and permits, lead filters in SQL, index warm-up, keep-warm, gateway key, lead repo wiring |
| `web` | 52 | 700 | Ask panel, answer pins, Map panes, candidates and triage, Undo row, Filters sheet, first-visit card, style rules, no-scroll rules |
| `@crm/sync` | 20 | 129 | fetch part (small result), plan (bound parts), validate (reconcile and holds), build index |
| `@crm/shared` | 9 | 36 | agent answer wire, `UNDO_WINDOW_MS` |
| `@crm/domain` | 5 | 30 | hex grid, distance |
| `@crm/observability` | 3 | 19 | metrics and dimensions |
| `@crm/index-schema` | 1 | 5 | |
| `@crm/oracle-views` | 19 (+1 skipped) | 247 (+5 skipped) | inherited |
| `@crm/oracle-contract` | 3 | 58 | inherited |
| `@crm/config` | 2 | 21 | |
| `infra` | 11 | 84 | stacks, cdk-nag, keep-warm rule, gateway secret grant (needs a longer timeout on a loaded machine) |

## Coverage of new and changed code (lines)

| Scope | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `apps/api` (all) | 94.7 % | 85.9 % | 95.8 % | 95.8 % |
| `apps/api/src/adapters/duckDbParquet.ts` | 95.3 % | 85.4 % | 95.5 % | 95.9 % |
| `apps/api/src/leadService.ts` | 77.8 % | 78.6 % | 66.7 % | 86.7 % (the two uncovered lines are the test-only override) |
| `apps/web` (all) | 91.3 % | 84.9 % | 89.9 % | 93.1 % |
| `apps/web/.../AskPanel.tsx` | 97.1 % | 86.4 % | 97.7 % | 99.2 % |
| `apps/web/.../FilterSheet.tsx` | 95.7 % | 92.4 % | 94.7 % | 98.2 % |
| `apps/web/.../answerPins.ts` | 98.3 % | 95 % | 100 % | 100 % |
| `apps/web/.../Map.tsx` | 88.8 % | 90.1 % | 79.1 % | 91.0 % |
| `apps/web/.../candidates.ts` | 90.3 % | 81.6 % | 92.3 % | 93.1 % |
| `apps/web/.../candidatesApi.ts` | 82.7 % | 84.4 % | 83.3 % | 84.1 % |

## Tests written first (TDD) in this closing round

- `unpublishedFilters.test.ts` (7 tests, 6 failed before the change), `answerNotes.test.ts`, `placeRepair.test.ts`, `leadRepoWiring.test.ts`, `index.warm.test.ts`, `handlers/warm.test.ts`, `leads.filter.sql.test.ts`, `getModel.test.ts` (mocked Secrets Manager), `infra/test/crm-api-stack.warm.test.ts`, web `UndoStatusRow.test.tsx`, `filter-sheet-phone.test.tsx`, `no-hscroll-rules.test.ts`.

## Honest notes

- The in-memory lead repo fake does not enforce DynamoDB reserved words, so the Undo bug (`sequence`) passed 9 unit tests and failed on the real table. The fix has a unit test of the expression text only; the proof is the golden round trip G7 on the deployed API (`docs/evidence/B-09.md`, pass 5).
- Opt-in performance cases (`CRM_PERF=1`, `CRM_REAL_INDEX_DIR`) are skipped by default and were run locally against the Run 2 index copy; their numbers are in `docs/evidence/B-09.md`.
- No `as unknown as` casts were added; three older ones remain outside B-09's files (`docs/reviews/CR-B-09.md`).
