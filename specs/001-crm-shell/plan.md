# Implementation Plan: CRM shell with disabled roadmap sections

**Branch**: `001-crm-shell` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-crm-shell/spec.md`

## Summary

Stand up the thinnest live CRM: a Turborepo app hosted on Amplify, a Cognito user pool with one seeded admin test user and no self sign-up, a MapLibre map that opens centered on and always covers Travis County, a typed 4th-attempt/5-minute lockout state, and a navigation rail whose five future sections (Campaigns, Estimates, Jobs, Invoices, Outreach) are `aria-disabled` with a tooltip and route to a Coming Soon page. Technical approach is `metagross`'s read-only design consult (`agent-design.md`): CDK stacks `CrmApi`/`CrmWeb`/`CrmDomain`/`CrmOps` only for this story (`CrmData`/`CrmSync` stay stubbed for B-02+), a custom pre-auth Lambda enforcing the exact lockout rule, client-side MapLibre bounds math, and a shared `NavRow` component reused for the 390 px "More" sheet.

## Technical Context

**Language/Version**: TypeScript (Node 20 Lambda runtime), React 18 + Vite for the web app — constitution Article II, no exception.

**Primary Dependencies**: React, MapLibre GL JS, tRPC (API Lambda + typed client), AWS CDK v2, `@aws-sdk/client-cognito-identity-provider` only inside the CDK custom resource (never at runtime in app code), Powertools for AWS Lambda (Logger/Tracer/Metrics).

**Storage**: One DynamoDB table in this story — `LockoutCounter` (`CrmOps` stack, `data-model.md`), holding the pre-auth lockout counter. `CrmData` (the future lead index/store) stays stubbed/empty; B-02+ populates it. Cognito plus this one table are the only stateful services B-01 provisions.

**Testing**: Vitest (unit, incl. the lockout-counter Lambda and the MapLibre bounds helper), Playwright against the hosted preview URL (never localhost, enforced by config per Article X), `smeargle` responsive suite at 390/768/1440.

**Target Platform**: Web (Amplify Hosting, `apps/web`), serverless API (API Gateway HTTP API + one Lambda, `apps/api`), region `eu-north-1` resolved through `packages/config`'s Zod-parsed runtime config (which itself reads `CDK_DEFAULT_REGION`/`AWS_REGION` and fails fast at cold start), never hard-coded and never read from `process.env` directly outside that one package (Article III, ARD-B §9/§12.8).

**Project Type**: Web application (frontend `apps/web` + backend `apps/api`, CDK infra in `infra/`) — Turborepo monorepo per Article IV.

**Performance Goals**: `health.ping` traced end-to-end in X-Ray within 3 s of page load (AC-2/NFR-001); sign-in to map-rendered under normal network conditions with no artificial delay.

**Constraints**: No self sign-up path anywhere (AC-1); map pan/zoom has no artificial limit but must never render less than the Travis County bounding box (AC-2); lockout fires on exactly the 4th consecutive failed attempt with a 5-minute cooldown, never a generic error (AC-3); disabled rows must be real `aria-disabled` elements, not merely styled to look disabled (AC-4); a tap on a disabled row must reach a real Coming Soon page, never a 404 (AC-5). Region locked to `eu-north-1` (only CloudFront/WAF/CloudWatch Logs may use `us-east-1`).

**Scale/Scope**: One shared test user; 2 CDK-deployed routes to verify (sign-in/map, Coming Soon); 5 disabled nav rows; 3 breakpoints (390/768/1440). No county property/permit data is read in this story (that starts at B-02).

## Kit Agent Ownership *(mandatory, constitution XIII–XVII)*

Copied from `stories/B-01-crm-shell.md` front matter and `specs/001-crm-shell/agent-design.md`.

| Role | Agent(s) | Skills loaded | What it decided (cite agent-design.md) |
|------|----------|---------------|----------------------------------------|
| Design consult | `metagross` | `build-frontend-backends`, `integrate-ci-cd`, `apply-engineering-guidelines` | Monorepo layout (`apps/web`, `apps/api`, `infra/` with 4 of the 6 constitution stacks active); Cognito shape with a custom pre-auth lockout Lambda; client-side MapLibre `minZoom`-from-bounds centering with no server round trip; shared `aria-disabled` `NavRow` + `/coming-soon/:section` route; 3 named risks (lockout Lambda correctness, viewport-specific bounds clipping, Lambda cold start vs. the 3 s X-Ray budget) (`agent-design.md` §§1–5) |
| Builder | `metagross` | `build-frontend-backends`, `integrate-ci-cd`, `apply-engineering-guidelines` | Implements the above: Turborepo scaffolding, Cognito/CDK stacks, MapLibre centering, lockout Lambda, `NavRow`/Coming Soon route (`agent-design.md` §§1–4) |
| Reviewer(s) | `metagross`, `audino` | — | `metagross` re-checks architecture conformance (stack boundaries, Article II–IV, X); `audino` checks UI drift from the Claude Design prototype (`CrmSignIn*`, `CrmMap*`, `CrmShell*`, `CrmComingSoon*`) and that disabled rows are actually `aria-disabled`, not just styled |
| Verify | Playwright on the hosted URL + `aria-disabled` check | — | `agent-design.md` §6: hit `https://crm.{domain}` (never localhost) in a private window, sign in with the seeded credentials, confirm map centering and the X-Ray trace within 3 s, exercise lockout on the 4th attempt, and check disabled rows/Coming Soon at 390/768/1440 |

**Patterns the code must show** (from the builder's answer):
- Turborepo layout with `packages/shared` (Zod schemas), `packages/api-client` (the one tRPC client), `packages/ui` (Atlas design-system components), and `packages/config` (region/runtime config) — `apps/web/src`, `apps/api/src`, `packages/shared/src`, `packages/api-client/src`, `packages/ui/src`, `packages/config/src`
- CDK stacks `CrmApi`, `CrmWeb`, `CrmDomain`, `CrmOps` (active); `CrmData`, `CrmSync` (declared, empty) — `infra/lib/*-stack.ts`; `CrmApi` declares an explicit CDK dependency on `CrmOps` for this story (Data Flow & Integration Points, above)
- Cognito custom resource seeding the admin user, password only in Secrets Manager — `infra/lib/crm-ops-stack.ts`
- Pre-auth Lambda lockout counter (DynamoDB-backed, 4th attempt / 5-minute cooldown) — `apps/api/src/auth/lockout-handler.ts`
- Powertools Logger/Tracer/Metrics on every Lambda, `health.ping` public and traced — `apps/api/src/handlers/health.ts`
- MapLibre client-side bounds guarantee (`cameraForBounds`-derived `minZoom`, no `maxBounds` cap) — `apps/web/src/components/Map/CrmMap.tsx`
- Shared `NavRow` Atlas component (`aria-disabled`, tooltip, routes to Coming Soon) lives in `packages/ui` (design-system components only, per constitution module-boundary table), imported by both the nav rail and the 390 px "More" sheet — `packages/ui/src/NavRow/*`, `apps/web/src/routes/ComingSoon/*`
- `apps/web` calls the API only through the Amplify `/api/*` same-origin rewrite (ARD-B §2.2/§8) — never a cross-origin base-URL env var, so there is no CORS surface

## Data Flow & Integration Points

- **Sign-in**: browser → Cognito (SRP, direct from `apps/web`, no API round trip) → JWT (`idToken`/`accessToken`/`refreshToken`) stored client-side (per `data-model.md`'s Session shape) → every subsequent tRPC call attaches the `accessToken` as a Bearer header.
- **Authorization**: API Gateway HTTP API's native Cognito JWT authorizer validates the token against the `CrmOps` pool's issuer/app-client-id before any request reaches the Lambda, on every route except `health.ping` (contract: `contracts/health.md`).
- **Lockout**: Cognito invokes the `CrmOps` pool's pre-authentication Lambda trigger (`apps/api/src/auth/lockout-handler.ts`) on every sign-in attempt; the trigger reads/writes the `LockoutCounter` DynamoDB item (`data-model.md`) and throws a typed error Cognito surfaces to the client as an authentication failure, which `apps/web`'s `SignIn` route maps to the exact lockout message via `cause.code` (never a raw Cognito exception string).
- **Health check**: browser loads the Map screen → `apps/web` calls `health.ping` (public, no authorizer) → `apps/api`'s Lambda responds, Powertools-traced → the resulting X-Ray segment is what AC-2/NFR-001 verifies.
- **Disabled rows → Coming Soon**: pure client-side routing (`NavRow` → `/coming-soon/:section`); no API call.
- **Deploy-order note**: `docs/architecture-constitution.md` §11 lists the full six-stack deploy order as `CrmData → CrmSync → CrmApi → CrmWeb → CrmDomain → CrmOps`. For this story, `CrmApi`'s JWT authorizer construct needs `CrmOps`'s user pool to exist first, so the effective deploy graph for B-01 is `CrmOps → CrmApi → CrmWeb → CrmDomain` (`CrmData`/`CrmSync` stay empty stubs, so their place in the ordering is moot this story). This **is** a recorded deviation from §11's literal listed order — see the Complexity Tracking row below, which is where it is justified, not here.
- **Cold-start risk decision** (closes `agent-design.md` §5 risk (c)): no provisioned concurrency for B-01 — it has an ongoing cost against the $120 shared credit (constitution Article III addendum) for a risk that is unmeasured. Instead: the Lambda is configured with 1024 MB memory (reduces cold-init duration without a standing cost), and `TZ03`'s Playwright run against the hosted URL is the first real measurement. If the measured cold-start X-Ray trace exceeds 3 s, that is logged as a defect (`docs/defects/ERR-{n}.md`) and provisioned concurrency is reconsidered then — the same "measure, then decide" pattern the architecture constitution already uses for the index cold-load NFR (§10).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Mark each ✅ / ❌ / N/A; every ❌ needs a row in Complexity Tracking.*

| # | Article | Check for this plan | Status |
|---|---------|---------------------|--------|
| I | Outcome first | Every AC verified on the hosted preview URL (`{NNN-slug}.{amplify-app-id}.amplifyapp.com`, later `crm.aldarraj.com`) with the real seeded test user; no localhost evidence | ✅ |
| II–IV | Stack | TypeScript everywhere (web, API, CDK, Lambda); CDK only, region from config (`eu-north-1` demo), every resource tagged `project_name=roofing-crm`; Turborepo with one `api-client`, no duplicated types | ✅ |
| V–VI | Contracts and LLM | Every tRPC input Zod-validated (session check, lockout state); no LLM calls in this story (N/A — agent work starts B-09) | ✅ / N/A |
| VII–IX | Operations | No queued external boundary in this story (no sync job yet — N/A until B-02); Powertools Logger/Tracer/Metrics + X-Ray on every Lambda including `health.ping`; alerting path recorded (SNS, per ARD-B §13 deviation) even though B-01 adds no alarms of its own | ✅ / N/A |
| X | Quality gates | Vitest (lockout Lambda, bounds helper), Playwright against the hosted URL (config fails on localhost), ESLint/Prettier/tsc in CI | ✅ |
| XI | Data honesty | N/A for this story — no property/permit/agent data is read or shown (that starts B-02); the Coming Soon page states plainly that the five sections are not yet built | N/A |
| XII | Secrets | Admin test password written only to Secrets Manager by the CDK custom resource; never in git, logs, or the PR body | ✅ |
| XIII–XV | Owner agents | Kit Agent Ownership filled above; `agent-design.md` exists and is cited; builder patterns listed with file paths | ✅ |
| XVI | Owner review | `metagross` and `audino` both score the branch 0–100 before G7; both must reach ≥ 75 or be fixed/justified in `docs/reviews/CR-B-01.md` | ✅ (planned) |
| XVIII–XXIII | Delivery | G4 passed (this session); G5/G6 run next in this plan; branch `001-crm-shell`; any hosted-test failure gets `docs/defects/ERR-{n}.md`. Tests-first (Article XXI) applies differently by test kind, per the Complexity Tracking row below: Vitest unit tests fail locally before their implementation exists, with no deploy needed; Playwright e2e tests are written first and confirmed failing against a local dev server before any cloud resource exists, then re-run against RUNTIME_URL once `TZ02` deploys it — this is the same spirit (test exists and fails before the feature works) applied to a test kind that inherently needs *some* running target, local or hosted | ✅ (planned) |
| Addendum | Task B (B1–B3) | B1: no property/permit data is read in this story at all — the strictest possible compliance (nothing to access). B2: N/A, no leads yet. B3: N/A, no agent yet | ✅ / N/A |

One recorded deviation (see Complexity Tracking below); otherwise no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-crm-shell/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (health.ping, me.get)
├── agent-design.md       # metagross read-only consult (constitution Article XIV)
├── run-log.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not this command)
```

### Source Code (repository root)

```text
apps/web/                         # React + Vite + MapLibre, deployed to Amplify Hosting
├── src/
│   ├── components/
│   │   ├── AppShell/              # copied from Task A A-03, renamed Crm*
│   │   ├── Map/CrmMap.tsx          # new: county-bbox-guaranteed MapLibre wrapper
│   │   ├── ComingSoonEntry/        # copied from Task A A-13 (read-only, git show)
│   │   └── ComingSoonSkeleton/     # copied from Task A A-13 (read-only, git show)
│   ├── routes/
│   │   ├── SignIn/                 # new: sign-in + typed lockout state
│   │   ├── Map/                    # new: the home screen
│   │   └── ComingSoon/             # copied pattern from Task A A-13, CRM's own section list
│   └── styles/                     # copied from Task A A-03 (Atlas tokens)
│
apps/api/                          # tRPC on one Lambda behind API Gateway HTTP API
├── src/
│   ├── handlers/health.ts          # new: health.ping, public, Powertools-wrapped
│   ├── routers/                    # new: AppRouter (health only in this story)
│   └── auth/lockout-handler.ts     # new: pre-auth Lambda, 4th attempt / 5 min cooldown
│
packages/
├── shared/                         # copied base from Task A A-03 + new Zod schemas (session, lockout state, roadmap-section enum)
├── api-client/                     # copied from Task A A-03 (the one tRPC client)
├── ui/NavRow/                      # new: shared aria-disabled row + tooltip (Atlas design-system component, reused by the rail and the 390 px More sheet)
├── config/                         # copied from Task A A-03 (Zod-parsed region/runtime config, fails fast at cold start)
├── tsconfig/                       # copied from Task A A-03
└── eslint-config/                  # copied from Task A A-03
│
infra/
├── lib/
│   ├── crm-api-stack.ts            # new: API Gateway + Lambda + Powertools wiring
│   ├── crm-web-stack.ts            # new: Amplify app/branch config
│   ├── crm-domain-stack.ts         # new: Route53/ACM/custom domain
│   ├── crm-ops-stack.ts            # new: Cognito pool + seeded admin user + lockout table
│   ├── crm-data-stack.ts           # stub only (B-02+ adds DynamoDB)
│   └── crm-sync-stack.ts           # stub only (not touched before B-02)
│
tests/e2e/
├── responsive.spec.ts              # copied from Task A A-03
├── config-guard.spec.ts            # copied from Task A A-03 (fails if pointed at localhost)
├── build-checks.spec.ts            # copied from Task A A-03
└── B-01.spec.ts                    # new: one Playwright test per AC-1..AC-5
```

**Structure Decision**: Standard Turborepo web-application layout (frontend `apps/web` + backend `apps/api`, shared `packages/*` including `packages/ui` and `packages/config` per the module-boundary table, infra as its own top-level `infra/` directory rather than nested under either app, since CDK stacks span both and are deployed independently). This matches `docs/architecture-constitution.md` §§4, 9 exactly; no deviation. CDK commands throughout this plan and `tasks.md` target the `infra` workspace (`pnpm --filter infra cdk ...`), not `apps/api` — `agent-design.md`'s mention of `apps/api/cdk` was the design consult's own shorthand and is superseded here by the constitution's module table.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `CrmApi` deploys with an explicit CDK dependency on `CrmOps` (effective order `CrmOps → CrmApi → CrmWeb → CrmDomain`), reversing `docs/architecture-constitution.md` §11's stated full-system order `CrmData → CrmSync → CrmApi → CrmWeb → CrmDomain → CrmOps` | `CrmApi`'s Cognito JWT authorizer construct needs `CrmOps`'s user pool and app client to exist before it can be created; `CrmData`/`CrmSync` are empty stubs in this story, so they impose no real ordering constraint yet | Deploying `CrmApi` first and wiring the authorizer in a second pass (e.g. a follow-up `cdk deploy` once `CrmOps` exists) was rejected: it would require two deploys per environment for no benefit, and `cdk deploy --all` already resolves same-story cross-stack dependencies correctly from an explicit `addDependency` call — this is CDK's normal mechanism, not a workaround. §11's order remains correct once B-02 populates `CrmData`/`CrmSync`, since nothing in this story changes their place in that six-stack sequence. |
| Playwright e2e tests (`T013`–`T016`, `T024`–`T025`) are "written first and confirmed failing" against a local dev server, not against RUNTIME_URL, before `TZ02` deploys — a literal reading of Article XXI ("tests must fail first") would otherwise require running a hosted-URL test before any hosted URL exists | A deployed target has to exist before any test — local or hosted — can run against it; unit tests (Vitest) have no such requirement and do fail locally before their implementation exists, satisfying Article XXI directly. e2e tests need *a* running target to execute at all | Skipping the "confirm it fails" step for e2e tests entirely was rejected — it would mean no evidence the test can fail at all before TZ03's hosted run, weakening Article XXI's intent. Running them against a stub/mock server was rejected as more complex than just using the Turborepo dev server (`pnpm --filter web dev` + `pnpm --filter api dev`), which already exists for local development and needs no new infrastructure. |
| No task explicitly adds an IAM Deny statement on Task A's resource ARNs to this story's Lambda execution roles (ARD-B §7, §12.1) | Overlooked in the first three task-generation passes; flagged by the fourth G5 pre-check | Not a deviation to justify — a genuine gap, fixed directly: see new task `T007B` in `tasks.md`, not carried as an accepted exception. |
