---
id: UT-RPT-B-02
type: unit-test-report
feature: FEAT-B02
story: B-02
owner: Claude (session, through the G7 close-out round), approved by HebaGaber
status: Complete
gate: G7
created: 2026-10-23
updated: 2026-10-23
---

# Unit Test Report: B-02 lead search index

Real `pnpm -r test` / `pnpm -r type-check` / `pnpm lint` / `pnpm format` output (Turborepo, all 14
workspace packages/apps with tests), run locally against branch `002-lead-index` at commit
`db55565` (the commit CI run `39972094970` validated — everything after it on the branch is
docs/spec-only). Supersedes the original E2-round numbers below (528 tests) — this report now
also reflects the `/speckit-converge` fixer round and the coverage round that raised `apps/sync`
and `packages/observability` to 80%+ coverage (`docs/evidence/B-02.md`).

## Summary

| Item | Value |
| --- | --- |
| Total test files | 68 |
| Total tests | 618 |
| Passed / failed / skipped | 613 / 0 / 5 |
| Pass rate | 100% (of non-skipped) |

## Per-package results (`pnpm -r test`)

| Package | Test files | Tests | Result |
| --- | --- | --- | --- |
| `packages/shared` | 2 | 6 | ✅ |
| `packages/oracle-contract` | 3 | 58 | ✅ |
| `packages/observability` | 2 | 13 | ✅ 100% stmts/funcs/lines, 85.71% branches — raised from 57.14% stmts in the coverage round |
| `packages/travis-austin@1.0.0` | 6 | 79 | ✅ |
| `packages/eslint-config` | 1 | 18 | ✅ |
| `packages/ui` | 1 | 3 | ✅ |
| `packages/config` | 2 | 16 | ✅ |
| `packages/index-schema` | 1 | 5 | ✅ (100% coverage) |
| `packages/oracle-views` | 18 | 246 (241 passed, 5 skipped, pre-existing) | ✅ |
| `apps/api` | 7 | 43 | ✅ 98.03% stmts |
| `apps/sync` | 15 | 76 | ✅ 93.29% stmts / 95.39% lines — raised from 65.95% lines in the coverage round (new: `engine.duckdb.test.ts`, `buildIndex.event.test.ts`, `validate.event.test.ts`) |
| `infra` | 4 | 21 | ✅ |
| `packages/api-client` | 2 | 7 | ✅ |
| `apps/web` | 4 | 27 | ✅ |
| **Total** | **68** | **618** (613 passed, 5 skipped) | **✅** |

Exact tail of the real run:

```
packages/shared test:  Test Files  2 passed (2)
packages/shared test:       Tests  6 passed (6)
packages/oracle-contract test:  Test Files  3 passed (3)
packages/oracle-contract test:       Tests  58 passed (58)
packages/observability test:  Test Files  2 passed (2)
packages/observability test:       Tests  13 passed (13)
packages/travis-austin@1.0.0 test:  Test Files  6 passed (6)
packages/travis-austin@1.0.0 test:       Tests  79 passed (79)
packages/eslint-config test:  Test Files  1 passed (1)
packages/eslint-config test:       Tests  18 passed (18)
packages/ui test:  Test Files  1 passed (1)
packages/ui test:       Tests  3 passed (3)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  16 passed (16)
packages/index-schema test:  Test Files  1 passed (1)
packages/index-schema test:       Tests  5 passed (5)
packages/oracle-views test:  Test Files  17 passed | 1 skipped (18)
packages/oracle-views test:       Tests  241 passed | 5 skipped (246)
apps/api test:  Test Files  7 passed (7)
apps/api test:       Tests  43 passed (43)
apps/sync test:  Test Files  15 passed (15)
apps/sync test:       Tests  76 passed (76)
infra test:  Test Files  4 passed (4)
infra test:       Tests  21 passed (21)
packages/api-client test:  Test Files  2 passed (2)
packages/api-client test:       Tests  7 passed (7)
apps/web test:  Test Files  4 passed (4)
apps/web test:       Tests  27 passed (27)
```

(`oracle-views`'s 5 skipped tests predate this story — unrelated to B-02's own scope.)

## Also validated on CI (not just locally)

CI run `https://github.com/HebaGaber/roofing-crm/actions/runs/39972094970` (`db55565`): `workspace`
(type-check, lint, these same unit tests, format, `cdk synth --strict`), `gitleaks`, and
`e2e-hosted` (Playwright against the live `002-lead-index` Amplify preview) all green. Getting
there required fixing several CI-only gaps (missing `tsx`/`vitest` devDependencies in three
vendored packages, `DATA_MANIFEST_CID` unset for synth, no QEMU for arm64 Docker bundling, one
flaky timing-sensitive test, and creating the Amplify branch preview) — see
`docs/evidence/B-02.md`'s "CI and coverage" section for the full account.

## New tests added this round, by CR-B-02 finding

| Finding | File | Test |
| --- | --- | --- |
| #1 (Promote `propertyCount`) | `apps/sync/test/promote.test.ts` | "persists propertyCount/permitCount/promotedAt onto META#index..."; "a second Promote run's Validate sees the real prior count — not undefined/null...end to end" (uses the real `extractPreviousPromotedPropertyCount` exported from `validate.ts`, not a re-implemented assumption) |
| #1 (API `indexInfo()`) | `apps/api/test/duckDbParquet.test.ts` | "reads propertyCount/permitCount/promotedAt from META#index..." |
| #2 (ADR-02 CloudFront) | `apps/sync/test/fetchPart.test.ts` | "fetches CloudFront at /{cid} directly, never /ipfs/{cid}..."; "still fetches Filebase/Pinata at /ipfs/{cid}..."; "productionFetchers() includes CloudFront first when GATEWAY_CLOUDFRONT_BASE_URL is set..."; "...skips CloudFront (never errors) when its env var is unset..." |
| #6 (token-bucket/retry) | `apps/sync/test/fetchPart.test.ts` | "drives the full MAX_RETRIES_BEFORE_SWITCH real fetch attempts even when the token bucket refuses a few times first" |
| #7 (shared S3 helper) | `packages/observability/test/s3.test.ts` | "streams the object's body to the destination path"; "throws when the object has no body..." |
| #8 (cold-load race) | `apps/api/test/duckDbParquet.test.ts` | "discards a timed-out cold load's connection once it finally resolves, instead of leaving it open or letting it corrupt a later successful retry" (deterministic deferred-promise interleaving, not real-time races) |

Each of these was shown failing against the pre-fix code before the corresponding fix landed
(the Promote/Validate propertyCount test against the old `UpdateExpression`; the CloudFront tests
against the old hard-coded Filebase/Pinata-only gateway lists; the retry-attempt test against the
old single-counter loop; the cold-load-race test against the un-keyed, uncancelled `coldLoad`).

## Also verified locally

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm -r type-check` | ✅ clean, all 15 TypeScript packages/apps (2 non-TS packages skipped by Turborepo scope) |
| Lint | `pnpm lint` (`eslint .`) | ✅ clean |
| Format | `pnpm format` (`prettier --check .`) | ✅ clean |

## Findings resolved this round (CR-B-02)

See `docs/evidence/B-02.md`'s "E2 fixer round" section for the full narrative per finding,
including the ADR-02 CloudFront decision (wired, not a recorded deviation) and the honest
limitation statement on FetchPart's per-invocation token-bucket scope (NFR-002 enforced
per-Lambda-invocation, not aggregated across the Map's concurrent invocations — no shared
rate-limit store exists in this codebase to reuse, and building one is out of this story's scope).

## Sign-off

**Decision:** ☐ Validated (counts toward G7) ☐ Returned, reason: {…} · pending the user's
re-score of `machamp` and `porygon` (E2's scope per `docs/reviews/CR-B-02.md`) and G7 approval.
