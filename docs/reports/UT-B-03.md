---
id: UT-RPT-B-03
type: unit-test-report
feature: [FEAT-B03, FEAT-B04, FEAT-B05, FEAT-B06]
story: B-03
owner: Claude (session, through the review/fixer round), approved by HebaGaber
status: Complete
gate: G7 (pending)
created: 2026-10-23
updated: 2026-10-24
---

# Unit Test Report: B-03 Search a radius for aged roofs and open permits, with full detail

Real `pnpm test` / `pnpm run type-check` / `pnpm run lint` / `pnpm run format` output (Turborepo,
all workspace packages/apps with tests), run locally against branch `003-map-search` at commit
`cc9ba00` — the final state, after the C2 build, the first review round and fixer pass, the
structural UI rebuild against the real design prototype (requested by the user after comparing
the live preview to it directly), a second `audino` full re-review, `smeargle`'s responsive pass,
and the G7 pre-check's own two findings (tasks.md checkboxes, apps/web coverage).

**Updated 2026-10-24** (supersedes the 2026-10-23 numbers below): `apps/web` grew from 58 to 77
tests (added `PermitChip`/`ResultRow` coverage per the G7 pre-check — that package's coverage was
85.33% stmts with two files under 80%; now 96.88% stmts / 98% lines, no file under 80%). `apps/api`
grew from 65 to 66 (the `ResourceNotFoundException`→`IndexNotReadyError` regression test). Total:
**80 test files, 708 tests (703 passed, 5 pre-existing skips), 100% pass rate.**

## Summary

| Item | Value |
| --- | --- |
| Total test files | 80 |
| Total tests | 708 |
| Passed / failed / skipped | 703 / 0 / 5 |
| Pass rate | 100% (of non-skipped) |

## Per-package results (`pnpm test`)

| Package | Test files | Tests | Result |
| --- | --- | --- | --- |
| `packages/domain` | 3 | 17 | ✅ **NEW this story** — `bboxFor`/`distanceMeters`, `isLongOpen`/`openDurationLabel`, `isAgedRoof`/`DEFAULT_ROOF_AGE_YEARS`, `MIN_RADIUS_MI`/`MAX_RADIUS_MI` |
| `packages/oracle-contract` | 3 | 58 | ✅ (unchanged; this story added `labels.ts`/`missingLabel`, covered by existing suite) |
| `packages/oracle-views` | 18 | 246 (241 passed, 5 skipped, pre-existing) | ✅ |
| `packages/shared` | 2 | 6 | ✅ |
| `packages/observability` | 2 | 13 | ✅ |
| `packages/oracle-profile-travis-austin` | 6 | 79 | ✅ |
| `packages/eslint-config` | 1 | 18 | ✅ |
| `packages/ui` | 1 | 3 | ✅ (this story added `MissingReason`/`Provenance`/`CidDisplay`/`Icon`/`StatusPill`, covered by existing suite) |
| `packages/config` | 2 | 16 | ✅ |
| `packages/index-schema` | 1 | 5 | ✅ |
| `packages/api-client` | 2 | 7 | ✅ |
| `apps/api` | 10 | 66 (up from 7 files / 43 tests at B-02) | ✅ **+3 files / +23 tests** — `search.properties.test.ts`, `search.permits.test.ts`, `property.get.test.ts`, plus the `IndexNotReadyError` regression test |
| `apps/web` (`web`) | 10 | 77 (up from 4 files / 27 tests at B-01) | ✅ **+6 files / +50 tests** — `gps-button.test.tsx`, `radius-control.test.tsx`, `filter-sheet-extended.test.tsx`, plus expanded `result-row-card.test.tsx`/`filter-sheet-controlled.test.tsx` coverage (96.88% stmts, up from 85.33%, after the G7 pre-check found `PermitChip.tsx` at 0% and `ResultRow.tsx` at 46%) |
| `infra` | 4 | 21 | ✅ (CrmApi suite extended for the new `indexBucketName`/`leadsTableName` props and the Docker-bundled TrpcHandler, memoized once per file) |
| `apps/sync` | 15 | 76 | ✅ (unchanged; not touched by this story) |
| **Total** | **80** | **708** (703 passed, 5 skipped) | **✅** |

(`oracle-views`'s 5 skipped tests predate this story, same as B-02's report — unrelated to B-03's scope.)

Exact tail of the real run:

```
packages/domain test:  Test Files  3 passed (3)
packages/domain test:       Tests  17 passed (17)
packages/oracle-contract test:  Test Files  3 passed (3)
packages/oracle-contract test:       Tests  58 passed (58)
packages/oracle-views test:  Test Files  17 passed | 1 skipped (18)
packages/oracle-views test:       Tests  241 passed | 5 skipped (246)
packages/shared test:  Test Files  2 passed (2)
packages/shared test:       Tests  6 passed (6)
packages/observability test:  Test Files  2 passed (2)
packages/observability test:       Tests  13 passed (13)
packages/oracle-profile-travis-austin test:  Test Files  6 passed (6)
packages/oracle-profile-travis-austin test:       Tests  79 passed (79)
packages/eslint-config test:  Test Files  1 passed (1)
packages/eslint-config test:       Tests  18 passed (18)
packages/ui test:  Test Files  1 passed (1)
packages/ui test:       Tests  3 passed (3)
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  16 passed (16)
packages/index-schema test:  Test Files  1 passed (1)
packages/index-schema test:       Tests  5 passed (5)
packages/api-client test:  Test Files  2 passed (2)
packages/api-client test:       Tests  7 passed (7)
infra test:  Test Files  4 passed (4)
infra test:       Tests  21 passed (21)
web test:  Test Files  8 passed (8)
web test:       Tests  58 passed (58)
apps/api test:  Test Files  10 passed (10)
apps/api test:       Tests  65 passed (65)
apps/sync test:  Test Files  15 passed (15)
apps/sync test:       Tests  76 passed (76)

Tasks:    16 successful, 16 total
```

## Also verified locally

| Check | Command | Result |
| --- | --- | --- |
| Type-check | `pnpm run type-check` | ✅ clean, all 13 Turborepo tasks |
| Lint | `pnpm run lint` (`eslint .`) | ✅ clean (1 real unused-var caught and fixed during the integration check) |
| Format | `pnpm run format` (`prettier --check .`) | ✅ clean (14 files auto-fixed across the integration check and fixer pass) |

Not yet run this round (deferred to Phase E, per the run book): Playwright against a live hosted
preview. `tests/e2e/B-03-map-search.spec.ts` parses and lists correctly (confirmed by the Group 1
builder: `playwright test --list`, 15 tests across 3 viewports) but has not executed against
`RUNTIME_URL`, since no Amplify preview has been deployed yet this session.

## Review round and fixer pass (CR-B-03)

Three parallel reviews (`metagross` 80/100, `audino` 48/100 — below the 75 threshold — and
`/code-review medium`, 8 findings) converged on one Critical: `apps/web/src/routes/Map/Map.tsx`
rendered a hand-rolled `<li>` list instead of the components this story actually built
(`FilterSheet`/`ResultRow`/`PermitChip`/`PropertyDetail`), so the whole feature was unreachable
through the UI. A fixer pass wired all four components in (plus `ExploreFilters.state.ts`'s URL
state via `useSearchParams`) and fixed 6 other real findings: `GpsButton`'s outside-county branch
silently dropping the located point (now matches the map-click path); `CrmMap`'s radius ring
hardcoding a light-mode hex instead of reading `--md-sys-color-primary` live; `MissingReason`
throwing uncaught on an unrecognized reason code (now falls back); `ExploreFilters.state.ts`'s
roof-age parser silently substituting the default on invalid input instead of dropping the filter
(now matches its own documented contract); the 0.5–25 mi radius bound duplicated as four
independent literals (now `MIN_RADIUS_MI`/`MAX_RADIUS_MI` in `packages/domain`); and a stale
"known gap" comment in `leadIndex.ts` that the CDK fix had already resolved.

`audino` re-scored the fix: **84/100**, Critical confirmed resolved by reading the current code
directly. Three lower-severity findings were deliberately left out of this fix pass (recorded, not
silently dropped): `RadiusControl.module.css`'s border-radius token choice, two unmodeled GPS
states (explain-first, low-accuracy) and one state-name mismatch, and `ResultRow`'s display of raw
lat/lon instead of an address/distance (blocked on Task A's FU-A-01, same gap the design decision
already anticipated — see `docs/02-design.md`).

Full reviews: `docs/reviews/CR-B-03.md`.

## Sign-off

**Decision:** ☐ Validated (counts toward G7) ☐ Returned, reason: {…} · pending Phase E (hosted
proof) and the user's G7 approval (Round 2).
