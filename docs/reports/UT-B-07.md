---
id: UT-B-07
type: unit-test-report
story: B-07
branch: 007-leads
commit: ae7768c
ci_run: https://github.com/HebaGaber/roofing-crm/actions/runs/40084514554
created: 2026-10-24
---

# Unit and Integration Test Report: B-07 Create, manage and browse CRM leads

Totals are from the final code (fixes in `2a2f669`, tests-only changes after). The CI workspace job (lint, type-check, unit tests) passed on the final commit `ae7768c`: https://github.com/HebaGaber/roofing-crm/actions/runs/40084514554 . The per-package totals below are from a local `pnpm exec turbo run type-check test` run on the same code (28 of 28 tasks); the CI log keeps raw escape codes, so it was not parsed.

| Item | Value |
| --- | --- |
| Command | `pnpm exec turbo run type-check test` (coverage: `pnpm --filter {pkg} run test:coverage`; `test:coverage` is not a turbo task) |
| Suites / tests | 99 test files passed (+1 skipped) / 845 tests passed |
| Passed / failed / skipped | 845 / 0 / 5 (the 5 skipped are inherited, in `@crm/oracle-views`) |
| Lint, format | `eslint .` clean, `prettier --check .` clean |
| Coverage of new and changed code | **Met**: every B-07 lead file is at or above 80 % on statements, branches, functions and lines (see below) |

## By package (this story touched `@crm/api`, `web`, `@crm/domain`, `@crm/sync`)

| Package | Files | Tests | Notes |
| --- | --- | --- | --- |
| `@crm/api` | 20 | 130 | lead repo (incl. edge cases), service, router, error format, index adapter |
| `web` | 18 | 138 | lead list, detail, create action, filter state, data hooks |
| `@crm/domain` | 4 | 25 | lead key, `requestIdentifierOf`, AC-5 pre-check |
| `@crm/sync` | 15 | 79 | promote and validate key shape, first-ever promote |
| other packages | 42 | 473 | unchanged by this story |

## Coverage of the lead code

| File | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| `apps/api/src/adapters/leadRepo.ts` | 97.9 % | 93.5 % | 94.1 % | 100 % |
| `apps/api/src/services/leads.ts` | 96.7 % | 91.9 % | 100 % | 97.2 % |
| `apps/api/src/routers/leads.ts` | 94 % | 84 % | 100 % | 93.8 % |
| `apps/api/src/trpc.ts` | 93.8 % | 90 % | 100 % | 93.8 % |
| `apps/api/src/adapters/duckDbParquet.ts` | 96.4 % | 85.5 % | 96.9 % | 96.9 % |
| `packages/domain` (all) | 100 % | 85 % | 100 % | 100 % |
| `apps/web/.../LeadDetail.tsx` | 100 % | 97.8 % | 100 % | 100 % |
| `apps/web/.../LeadsList.tsx` | 100 % | 97.4 % | 100 % | 100 % |
| `apps/web/.../leadsApi.ts` | 100 % | no branches | 100 % | 100 % |

**Raised after the G7 pre-check flagged it (commit below):** the web lead screens and the lead store's branches were under 80 % (list 54 %, detail 68 %, hooks 0 %, store branches 70 %). Four new test files bring every lead file to at least 80 % on all four measures: `leadsApi.test.tsx` (the real hooks on a real query client), `LeadsList.interactions.test.tsx`, `LeadDetail.actions.test.tsx` and `leadRepo.edges.test.ts`. No production bug was found by them.

## Tests written first (TDD)

| Area | Test file | Failed first? | Now |
| --- | --- | --- | --- |
| Lead store, tRPC procedures, list UI (phase C, tasks T006 to T027) | `apps/api/test/**`, `apps/web/test/**` | yes per the run log (builders showed each failing first) | PASS |
| First-ever promote (`if_not_exists`) | `apps/sync/test/promote.test.ts` | yes | PASS |
| Transaction conflict retry (3 tests) | `apps/api/test/leadRepo.conflict.test.ts` | yes (2 of 3 failed; the bounded give-up test passed trivially before) | PASS |
| Newest lead first (2 tests) | `apps/api/test/leadRepo.order.test.ts` | yes | PASS |
| Note shown as typed (3 tests) | `apps/web/test/leads/eventText.test.ts` | yes | PASS |
| Snapshot permit, per-permit button, "Add note" guard | `apps/web/test/leads/*` | yes (web tests seen failing) | PASS |
| Review fixes: filter limit, caller scope, request-id parsing, note trim, partial location filter (9 tests) | `apps/api/test/**`, `packages/domain/test/leads.test.ts` | yes | PASS |
| `META#index` key shape (3 tests: promote, validate, API reader) | `apps/sync/test`, `apps/api/test` | **no**: written after the fix | PASS |
| Error code reaches the browser (`withAppCode`) | `apps/api/test/appCode.test.ts` | **no**: written with the code | PASS |
| Snapshot permit and AC-5 presence (service and adapter tests) | `apps/api/test/services/leads.test.ts`, `query.test.ts` | **no**: written in one pass with the code | PASS |

## Failures and flakes

| Test | Cause | Action |
| --- | --- | --- |
| `duckDbParquet.test.ts` cold-load race (B-02) | Failed on the slower CI machine: a fixed 50 ms sleep before checking that the stale connection closed | Fixed in `1c8d151`: polls up to 3 s. 5 of 5 repeat local runs passed; the CI workspace job passed on `2a2f669` |
| `A-13-vitals.spec.ts` (e2e, not unit) | Oracle spec importing a package and helpers this repo lacks; broke the hosted CI job | Removed in `1c8d151` (see `CR-B-07` finding 5) |
| Web test mocked `error.data.cause.code` | The mock matched a shape the API never sends, so it passed while AC-2 was broken in the browser | Fixed: the client reads `data.appCode`; found only by the hosted run (ERR-1) |
