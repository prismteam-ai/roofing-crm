---
id: UT-RPT-B-01
type: unit-test-report
feature: FEAT-B01
story: B-01
owner: Claude (session), approved by HebaGaber
status: Complete
gate: G7
created: 2026-10-23
---

# Unit Test Report: B-01 CRM shell with disabled roadmap sections

Real `pnpm run test` output (Turborepo, all 8 packages/apps), at commit `d46815a`, run locally with the repo's own scripts — matching what `.github/workflows/ci.yml`'s `workspace` job runs (see the CI note below). Updated 2026-10-23 after closing TD-5 (coverage was initially accepted as an exception below 80%, then fixed outright with real tests rather than left standing — see `docs/decisions/tech-debt.md`).

## Summary

| Item | Value |
| --- | --- |
| Total test files | 15 |
| Total tests | 94 |
| Passed / failed | 94 / 0 |
| Pass rate | 100% |

## Per-package results

| Package | Test files | Tests | Result |
| --- | --- | --- | --- |
| `packages/config` | 1 | 5 | ✅ |
| `packages/shared` | 2 | 6 | ✅ |
| `packages/eslint-config` | 1 | 18 | ✅ |
| `packages/ui` | 1 | 3 | ✅ |
| `packages/api-client` | 2 | 7 | ✅ (TD-5 added `react.tsx`'s `ApiProvider`/`createQueryClient` — confirmed unused by any route in this repo, but tested rather than deleted) |
| `apps/api` | 4 | 19 | ✅ (TD-5 added the Lambda `handler()` envelope against a realistic API Gateway event, the `triggerSource` dispatch, and `routers/auth.ts`'s `reportFailedAttempt` procedure — all previously untested beyond the pure logic beneath them) |
| `apps/web` | 4 | 27 | ✅ (TD-5 added `signIn()`'s real SRP call + `reportFailedAttempt` wiring and `loadCognitoWebConfig`) |
| `infra` | 1 | 12 | ✅ (all 6 CDK stacks, `Template.fromStack`, no AWS credentials needed) |
| **Total** | **15** | **94** | **✅ 94/94** |

## Coverage (TD-5 — all packages now ≥80% on lines/statements)

| Package | Statements | Branches | Before TD-5 |
| --- | --- | --- | --- |
| `apps/api` | 96.03% | 90.62% | 41.58% |
| `apps/web` | 97.91% | 72.72% | 56.25% |
| `packages/api-client` | 92.85% | 81.81% | 42.85% |
| `packages/shared` | 100% | 100% | (already ≥80%) |
| `packages/config` | 100% | 100% | (already ≥80%) |
| `packages/ui` | 100% | 75% | (already ≥80%) |
| `infra` | 95.65% | 50% | (already ≥80%) |

## Also verified locally (same commands `.github/workflows/ci.yml`'s `workspace` job runs)

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm run type-check` | ✅ clean, all 8 packages |
| Lint | `pnpm run lint` (`eslint .`) | ✅ clean |
| Format | `pnpm run format` (`prettier --check .`) | ✅ clean |
| CDK synth + cdk-nag | `cdk synth --strict` (infra/) | ✅ 0 errors, 0 `AwsSolutions-*` findings, all 6 stacks |

## CI note

`.github/workflows/ci.yml` exists on this story branch (fixed in this story — see `specs/001-crm-shell/run-log.md`'s Phase E entry; the version T001 copied was almost entirely Task A's own CI, unadapted, and would have silently no-op'd or failed outright on every job). **It has never actually run on GitHub**, because GitHub Actions only triggers workflows that exist on the repository's **default branch** (`main`), and `main` currently has no `.github/workflows/` directory at all — a repo-wide bootstrapping gap, not something this story can fix (merging to `main` is explicitly out of scope per CLAUDE.md, and this story merges only into `feature/roofing-crm`). The table above runs every command the workflow's `workspace` job runs, locally, with real output, as the closest available substitute for "CI green" until a workflow file lands on `main`.

## Sign-off

**Decision:** ☐ Validated (counts toward G7) ☐ Returned, reason: {…} · pending the user's G7 approval (Round 2)
