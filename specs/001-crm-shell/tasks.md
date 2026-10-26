---
description: "Task list for B-01 CRM shell with disabled roadmap sections"
---

# Tasks: CRM shell with disabled roadmap sections

**Input**: Design documents from `specs/001-crm-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/health.md, quickstart.md

**Tests**: MANDATORY (constitution X, XXI, XXII). Test tasks come first in every phase and must fail before the implementation tasks run.

**Builder**: every implementation task is delegated to `soofi-xyz-team-kit:metagross` (constitution XV), split into exactly 2 groups per the plan's Kit Agent Ownership section: **Group A "shell + hosting"** (Setup, Foundational, US1's map/health/hosting tasks, US2) and **Group B "auth"** (US1's Cognito/lockout tasks). Both load `build-frontend-backends`, `integrate-ci-cd`, `apply-engineering-guidelines`.

**RUNTIME_URL**: the Amplify preview for this branch, `{NNN-slug}.{amplify-app-id}.amplifyapp.com` (printed by the Amplify build in Phase D of the walkthrough) — never `localhost`, enforced by `config-guard.spec.ts`.

## Format: `[ID] [P?] [Story] [Group] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (sign-in + map, P1) or US2 (disabled sections, P2). Setup, Foundational, Phase Z and Polish tasks carry no `[Story]` label by design (per the tasks template: they are cross-cutting, not story-scoped) — this is an explicit exemption, not an omission.
- **[Group]**: A (shell + hosting) or B (auth). Exempt for the same cross-cutting tasks where neither group uniquely owns the work (TZ01, TZ04–TZ06, TN01–TN02).

## Phase 1: Setup (Shared Infrastructure) — Group A

- [x] T001 [Group A] Copy from Task A A-03 (merged, commit 8ae1870) per `docs/architecture-constitution.md` §9: `packages/tsconfig`, `packages/eslint-config`, `packages/shared`, `packages/api-client`, `packages/config`, `infra/bin/app.ts`, `infra/cdk.json`, `.github/workflows`, `apps/web/src/styles`, `apps/web/src/components/{AppShell,Icon,EmptyState,ErrorBanner,Skeleton,StatusPill}`, `tests/e2e/{responsive,config-guard,build-checks}.spec.ts` via `bash ../assessment-guide/scripts/copy-from-oracle.sh "<path>"` for each; log every copy in `docs/reuse-log.md`. (The six story-specific CDK stack files — `infra/lib/crm-{data,sync,api,web,domain,ops}-stack.ts` — are new in this story and written in T005/T007/T009/T010/T017, not copied here.)
- [x] T002 [Group A] Copy A-13's Coming-soon pattern read-only from the unmerged branch: `git -C ../oracle-property-intelligence-platform-pipeline-travis-tx-u show 013-explorer-and-pages:apps/web/src/components/ComingSoonEntry.tsx` (and its `.module.css`, `ComingSoonSkeleton.tsx`/`.module.css`, `apps/web/src/routes/ComingSoon.tsx`/`.module.css`, `apps/web/test/coming-soon.test.tsx`) into the matching `apps/web/src/` paths; record the source commit/branch in `docs/reuse-log.md` (do not switch that worktree's checked-out branch)
- [x] T003 [Group A] Rename every copied `CountyLens*`/Task-A-specific identifier to `Crm*` across the paths copied in T001/T002 (`apps/web/src/**`, `apps/api/src/**` where applicable, `infra/lib/**`, `.github/workflows/**`) per `docs/architecture-constitution.md` §9 (`CrmData`, `CrmSync`, `CrmApi`, `CrmWeb`, `CrmDomain`, `CrmOps`); re-point `apps/web/src/routes/ComingSoon.tsx` at the CRM's own section list (`campaigns`, `estimates`, `jobs`, `invoices`, `outreach`) instead of Task A's
- [x] T004 [Group A] Run the copied tests (`pnpm test`, `pnpm --filter web test`) across `apps/web/test/**` and `apps/api/test/**`, and fix only what the rename broke; nothing else. **Not [P]**: depends on T003's rename being complete first.

**Checkpoint**: monorepo scaffolding, Atlas tokens, app shell and Coming-soon pattern exist and pass their copied tests.

## Phase 2: Foundational (Blocking Prerequisites) — Group A

- [x] T005 [P] [Group A] Declare `infra/lib/crm-data-stack.ts` and `infra/lib/crm-sync-stack.ts` as empty/stubbed CDK stacks (no resources yet — B-02 populates them), per `research.md`'s decision to keep all six stacks structurally present
- [x] T006 [P] [Group A] Contract test for `health.ping` in `apps/api/test/handlers/health.test.ts`, asserting the exact shape in `contracts/health.md` (`{ ok: true, timestamp: string }`, Zod-validated, no auth required) — write this test first and confirm it fails (no handler exists yet)
- [x] T007 [Group A] `infra/lib/crm-api-stack.ts`: API Gateway HTTP API + one Lambda (tRPC `AppRouter`, `health` router only), Powertools Logger/Tracer/Metrics wired, Cognito JWT authorizer attached to every route except `health.ping`; declares an explicit CDK dependency on `crm-ops-stack.ts` (T017) per `plan.md`'s Data Flow & Integration Points. Checked already (2026-10-23, `lambda:GetAccountSettings`, `eu-north-1`): `ConcurrentExecutions=10`, `UnreservedConcurrentExecutions=10`, 2 functions currently deployed account-wide (Task A's). This story adds 2 more (health handler, lockout trigger) for 4 total — well within the shared limit at demo traffic levels (architecture-constitution.md "Open items" #3). No design change needed; recorded in `specs/001-crm-shell/run-log.md`.
- [x] T008 [Group A] `apps/api/src/handlers/health.ts`: implement `health.ping` per `contracts/health.md`, public, Powertools-wrapped — makes T006 pass
- [x] T007B [Group A] `infra/lib/crm-api-stack.ts` and `infra/lib/crm-ops-stack.ts`: add an explicit `iam.PolicyStatement` with `effect: iam.Effect.DENY` on every Lambda execution role in this story, naming Task A's resource ARN patterns (its S3 buckets, DynamoDB tables, SSM parameter paths — see `docs/architecture-constitution.md` §7, §12.1) — a second line of defense alongside never calling those APIs in code
- [x] T009 [Group A] `infra/lib/crm-web-stack.ts`: Amplify app + branch config for `apps/web`, API reached only through the Amplify `/api/*` same-origin rewrite (ARD-B §2.2/§8) — no cross-origin base-URL env var
- [x] T010 [Group A] `infra/lib/crm-domain-stack.ts`: Route53/ACM/custom domain for `crm.aldarraj.com`, **not yet pointed live** — cut over only after this story merges to `feature/roofing-crm` (Round 1 decision D-2); Amplify default domain serves RUNTIME_URL in the meantime

**Checkpoint**: API Gateway, one public health endpoint (T006 passing), and hosting stacks exist; nothing auth-gated can be built on top until Group B's Cognito pool exists (T011).

## Phase 3: User Story 1 - Sign in and land on the county map (Priority: P1) 🎯 MVP

**Goal**: A rep with the shared test login signs in once and lands on a map centered on, and always covering, Travis County; repeated failed attempts produce a typed lockout, never a crash; a tile outage shows a named failure state, never a blank grid.

**Independent Test**: Open RUNTIME_URL in a private window, sign in with the shared test credentials, confirm the map opens centered on Travis County. No other story's code is needed.

### Tests for User Story 1 (MANDATORY, write first) ⚠️

- [x] T011 [P] [US1] [Group B] Unit test for the pre-auth lockout Lambda in `apps/api/test/auth/lockout-handler.test.ts`: asserts 0→3 failed attempts stay unlocked, the 4th sets `lockedUntil = now+5m`, a request during the cooldown is rejected with the typed lockout error, and the cooldown's expiry resets `failedAttempts` to 0 (`data-model.md`'s `LockoutCounter` state transitions) — write this test first and confirm it fails (no handler exists yet)
- [x] T012 [P] [US1] [Group A] Unit test for the MapLibre bounds helper in `apps/web/test/components/Map/crm-map-bounds.test.ts`: asserts `minZoom` is derived from `cameraForBounds` on the Travis County bbox (≈30.09–30.52°N, −98.17–−97.33°W) and that no `maxBounds` is set — write first, confirm it fails
- [x] T013 [US1] Playwright test `AC-1` (TC-001, TC-006, TC-010) in `tests/e2e/B-01.spec.ts`: private-window sign-in with the seeded credentials against RUNTIME_URL (never localhost — `config-guard.spec.ts` enforces this), asserts landing on the Map screen centered on Travis County, no self-sign-up link, and session survival on reload — write first, confirm it fails against the not-yet-deployed stack. **Not [P]**: T013–T016 all add cases to the same file, `tests/e2e/B-01.spec.ts`, so they run sequentially within this task set.
- [x] T014 [US1] Playwright test `AC-2` (TC-002) in `tests/e2e/B-01.spec.ts`: asserts free pan/zoom never drops below the county bbox and a `health.ping` X-Ray trace appears within 3 s of page load — write first, confirm it fails
- [x] T015 [US1] Playwright test `AC-3` (TC-003, TC-004, TC-011) in `tests/e2e/B-01.spec.ts`: 3 wrong passwords then a 4th, asserts the typed "Too many attempts — try again in 5 minutes" message, never a generic error; and a successful sign-in after the 5-minute cooldown — write first, confirm it fails
- [x] T016 [US1] [Group A] Playwright test for the tile-failure edge case (TC-007) in `tests/e2e/B-01.spec.ts`: aborts tile-host requests via a Playwright route, asserts the named `CrmMapFailed390` state renders with a "Retry" action, never a blank grey grid — write first, confirm it fails (closes the spec.md edge case gap flagged at G5)

### Implementation for User Story 1

- [x] T017 [US1] [Group B] `infra/lib/crm-ops-stack.ts`: Cognito `UserPool` (`selfSignUpEnabled: false`, no sign-up UI route), one `UserPoolClient` (SRP, no client secret), a DynamoDB `LockoutCounter` table (`username` PK, `failedAttempts`, `lockedUntil` per `data-model.md`), and a CDK custom resource (`AwsCustomResource` → `AdminCreateUser` + `AdminSetUserPassword`) seeding one admin test user with the password written only to Secrets Manager (Round 1 decision D-1) — depends on T011 existing (written and confirmed failing); T011 itself only passes once T018 is also implemented
- [x] T018 [US1] [Group B] `apps/api/src/auth/lockout-handler.ts`: pre-auth Lambda implementing the state machine in `data-model.md` (4th consecutive failure → lock 5 minutes; success or cooldown elapse → reset to 0), wrapped in Powertools Logger/Tracer/Metrics like every other Lambda in this story (constitution Article VIII, ARD-B §12.13 — every Lambda, not only `health.ts`), wired as the Cognito pre-authentication trigger on the pool from T017 — makes T011 pass
- [x] T019 [US1] [Group A] `packages/shared/src/schemas/session.ts`: Zod schema for the session shape in `data-model.md` (idToken/accessToken/refreshToken/expiresAt), imported by both `apps/web` and `apps/api`
- [x] T020 [US1] [Group A] `apps/web/src/routes/SignIn/SignIn.tsx`: sign-in form against the Cognito pool via SRP, with the typed lockout state rendered from the Cognito error code mapped through `cause.code` (never a raw 500/blank screen), session persisted across a reload — makes T015 pass
- [x] T021 [US1] [Group A] `apps/web/src/components/Map/CrmMap.tsx`: MapLibre wrapper, `center: [-97.7431, 30.2672]`, `minZoom` derived once via `map.cameraForBounds` on the county bbox, no `maxBounds` set (per `research.md`), plus the `CrmMapFailed390` state with a "Retry" action on tile-load failure — makes T012 and T016 pass
- [x] T022 [US1] [Group A] `apps/web/src/routes/Map/Map.tsx`: the home screen rendering `CrmMap`, gated behind the Cognito JWT session from T020 — makes T013/T014 pass together with T006/T008
- [x] T023 [US1] [Group A] Atlas-token-only styling pass on `apps/web/src/routes/SignIn/SignIn.module.css` and `apps/web/src/routes/Map/Map.module.css` (no raw colors/spacing outside `packages/ui` tokens, per constitution P0-14)

**Checkpoint**: User Story 1 fully functional and independently testable — sign-in, map centering/bounds, tile-failure state, and lockout all pass on RUNTIME_URL.

## Phase 4: User Story 2 - See the roadmap, honestly marked not built yet (Priority: P2)

**Goal**: The signed-in rep sees Campaigns/Estimates/Jobs/Invoices/Outreach as disabled rows with a tooltip, and tapping one reaches a real Coming Soon page.

**Independent Test**: While signed in on the Map screen, open the nav rail (or, at 390 px, the "More" sheet), confirm the five rows are disabled with a tooltip, tap one, confirm it opens Coming Soon rather than a broken/missing page.

### Tests for User Story 2 (MANDATORY, write first) ⚠️

- [x] T024 [US2] [Group A] Playwright test `AC-4` (TC-005, TC-009) in `tests/e2e/B-01.spec.ts`: asserts all 5 rows render with `aria-disabled="true"` and a "Coming soon" tooltip on hover/focus at 1440 px and inside the "More" sheet at 390 px — write first, confirm it fails. **Not [P]**: same file as T025.
- [x] T025 [US2] [Group A] Playwright test `AC-5` (TC-008) in `tests/e2e/B-01.spec.ts`: tapping the disabled "Campaigns" row opens a Coming Soon page with a working "Back to Map" action, never a 404 — write first, confirm it fails

### Implementation for User Story 2

- [x] T026 [US2] [Group A] `packages/shared/src/schemas/roadmap-section.ts`: Zod enum `campaigns | estimates | jobs | invoices | outreach` (`data-model.md`'s `RoadmapSection`)
- [x] T027 [US2] [Group A] `packages/ui/src/NavRow/NavRow.tsx`: shared Atlas design-system component (per constitution's module-boundary table — lives in `packages/ui`, not `apps/web`), `aria-disabled="true"`, `tabIndex={0}`, tooltip "Coming soon" on hover/focus, routes to `/coming-soon/:section` on click — makes T024 pass
- [x] T028 [US2] [Group A] Wire the 5 `NavRow`s (from `packages/ui`) into `apps/web/src/components/AppShell/NavRail.tsx` (1440/768 px) and `apps/web/src/components/AppShell/MoreSheet.tsx` (390 px), same component instance, no duplicate implementation
- [x] T029 [US2] [Group A] `apps/web/src/routes/ComingSoon/ComingSoon.tsx`: adapt the copied Task A A-13 pattern (T002) to read the CRM's own `RoadmapSection` list and render "Back to Map" — makes T025 pass

**Checkpoint**: both user stories independently functional; the full story is demo-ready.

## Phase N: Polish & Cross-Cutting Concerns (pre-deploy only — no RUNTIME_URL needed yet)

- [x] TN01 Confirm each stack file — `infra/lib/crm-api-stack.ts` (T007), `infra/lib/crm-web-stack.ts` (T009), `infra/lib/crm-domain-stack.ts` (T010), `infra/lib/crm-ops-stack.ts` (T017) — applies `cdk.Tags.of(stack).add('project_name', 'roofing-crm')` per constitution Article III; add the tag where missing
- [x] TN02 Run `cdk synth --strict` with `cdk-nag` from `infra/`, enumerating each stack explicitly (`infra/lib/crm-data-stack.ts`, `crm-sync-stack.ts`, `crm-api-stack.ts`, `crm-web-stack.ts`, `crm-domain-stack.ts`, `crm-ops-stack.ts`), clean on all 6. **Not [P] with TN01**: TN02 re-synthesizes the same files TN01 may have just edited (to add tags), so TN01 must finish first.

*(`quickstart.md`'s scenarios are the same ACs `tests/e2e/B-01.spec.ts` already covers; it is exercised by TZ03 below, not as a separate pre-deploy task — it needs RUNTIME_URL, which does not exist until TZ02.)*

## Phase Z: Prove on the hosted runtime (mandatory, always last)

- [x] TZ01 Run `metagross` and `audino` read-only against this branch; write `docs/reviews/CR-B-01.md` (each ≥ 75 or justified)
- [x] TZ02 Deploy to the hosted runtime: `git push origin 001-crm-shell` (Amplify preview, becomes RUNTIME_URL) + `pnpm --filter infra cdk deploy --all` (`infra/lib/crm-{api,web,domain,ops}-stack.ts`, in CDK-dependency order per `plan.md`'s Data Flow & Integration Points); record RUNTIME_URL in `specs/001-crm-shell/run-log.md`
- [x] TZ03 Run `tests/e2e/B-01.spec.ts` (AC-1..AC-5, all 11 non-NFR cases plus TC-NF-01 and TC-NF-03 in `testplans/B-01-test-cases.md`) against RUNTIME_URL — never localhost; walk `specs/001-crm-shell/quickstart.md`'s scenarios manually once as a cross-check; screenshots to `docs/evidence/img/`
- [x] TZ04 Run `smeargle` responsive-design-tests at 390/768/1440 on the sign-in, map and Coming Soon pages (TC-NF-02), writing its generated specs under `tests/e2e/responsive/*`, against RUNTIME_URL
- [x] TZ05 Run the story's `agents.verify` check — Playwright login + `aria-disabled` check — by re-citing the already-passing `tests/e2e/B-01.spec.ts` results from TZ03 above; no new test file, this task only records that citation in `docs/reports/TR-B-01.md`
- [x] TZ06 Write `docs/reports/TR-B-01.md`, `docs/evidence/B-01.md` (§ B-10 for the disabled-sections part), the `docs/traceability.md` row, and one `docs/kit-usage.md` line

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2)** → **US1 (Phase 3)** → **US2 (Phase 4)** → **Polish (Phase N)** → **Phase Z** (always last, per constitution XXII)
- Group B (T011, T017, T018) can start as soon as Phase 2 is checkpointed; Group A's US1 UI tasks (T019–T023) depend on T017/T018 existing (the pool/lockout Lambda) but not on their final polish, so the two groups can build in parallel once Phase 2 is done
- US2 (Phase 4) depends only on Phase 2 (the app shell) and T002's copied Coming-soon pattern, not on US1's auth internals — it could build in parallel with US1 if staffed, though this story runs both groups sequentially in Group A/B order per the plan

### Parallel Example

```text
# Once Phase 2 is checkpointed, in parallel:
Group A: T019, T020, T021, T022, T023 (shell + hosting UI)
Group B: T017, T018 (Cognito + lockout)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 → Phase 2 → Phase 3 (US1) → validate independently on RUNTIME_URL → this alone proves AC-1/AC-2/AC-3.
2. Phase 4 (US2) adds the disabled-roadmap honesty requirement (AC-4/AC-5) on top, then Phase N and Phase Z prove everything together.
