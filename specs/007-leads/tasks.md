---

description: "Task list for B-07 Create, manage and browse CRM leads"
---

# Tasks: Create, manage and browse CRM leads

**Input**: Design documents from `specs/007-leads/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/leads.md, quickstart.md

**Tests**: MANDATORY (constitution X, XXI, XXII). Test tasks come first in every group and must fail before their implementation tasks run. `/speckit-implement` executes through Phase N (Polish) and stops before Phase Z; Phase Z's tasks are listed below for completeness (constitution XVIII) but are actually run in Phase D of `../assessment-guide/WALKTHROUGH-B-07-leads.md` (that file exists in the repo one level above this one), not by `/speckit-implement`.

**Builder**: every implementation task is delegated to `metagross` (story front matter `agents.builder`), per constitution XV. At most two builder subagents run per `/speckit-implement` call, one per group below.

**Organization**: Grouped into exactly two task groups (not by the spec's four user stories) per this story's walkthrough — "lead store + tRPC procedures" (Group GA) and "lead list UI + URL-encoded filters" (Group GB) — so `/speckit-implement` can delegate each to one `metagross` builder subagent in a single message. Setup, Foundational and Polish phases still apply around the two groups, as in the standard template.

## Format: `[ID] [P?] [Group] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Group]**: `[GA]` lead store + tRPC procedures, `[GB]` lead list UI + URL-encoded filters. Setup/Foundational/Polish tasks carry no group label (template convention).

---

## Phase 1: Setup

- [X] T001 No file change — verification only: run `pnpm turbo run build test --filter=@crm/shared --filter=@crm/domain --filter=@crm/api --filter=web` from the repo root and confirm it is green on branch `007-leads` before T002 adds anything
- [X] T002 [P] Add the `crm-leads` DynamoDB table construct skeleton (name only, no attributes/GSIs yet) to `infra/lib/crm-data-stack.ts`, tagged `project_name=roofing-crm`, region read from `infra/src/config.ts` (never hard-coded)

---

## Phase 2: Foundational (blocking both groups)

- [X] T003 Define `Lead`, `LeadSignals`, `LeadEvent`, `LeadFilters` Zod schemas in `packages/shared/src/schemas/lead.ts` per data-model.md (status enum `new|contacted|qualified|won|lost`; note text has no length cap in the schema itself — the 4,000-char cap is enforced at the tRPC input boundary, T012)
- [X] T004 [P] Export the new schemas from `packages/shared/src/index.ts`
- [X] T005 Add `leadKey(fips, requestIdentifier)` and `isNotInCurrentRun(sourceManifestCid, currentManifestCid)` pure functions to `packages/domain/src/leads.ts`, exported from `packages/domain/src/index.ts`, unit tested in `tests/packages/domain/leads.test.ts` (test written and failing before the implementation)

---

## Group GA: Lead store + tRPC procedures

**Goal**: FR-001, FR-002, FR-003 (AC-1, AC-2, AC-3) — a lead can be created once per property key, its status/notes persist, and 20 concurrent creates resolve to exactly 1 winner.

**Independent test**: Call `leads.create` for a property, confirm the row and its `SIGNALS`/`EVT#0` items exist; call it again for the same key and confirm `ALREADY_EXISTS`; call `leads.updateStatus` + `leads.addNote`, then `leads.get`, and confirm both persisted.

### Tests first (write failing before implementation)

- [X] T006 [P] [GA] Vitest: `leadRepo.create` writes `LEAD`+`SIGNALS`+`EVT#0` transactionally and rejects a second create for the same `pk` with `ConditionalCheckFailed` — `apps/api/test/leadRepo.test.ts`
- [X] T007 [P] [GA] Vitest: `leadRepo.create` under 20 concurrent calls for the same key resolves to exactly 1 success and 19 `ConditionalCheckFailed` (NFR-001, 0 lost updates) — `apps/api/test/leadRepo.concurrency.test.ts`
- [X] T008 [P] [GA] Vitest: `leadRepo.updateStatus`/`addNote` append a gapless `EVT#{sequence}` and update the `LEAD` projection; a write against a stale `eventSequence` is refused, never silently lost — `apps/api/test/leadRepo.events.test.ts`
- [X] T009 [P] [GA] Vitest: `leadService.create`/`updateStatus`/`addNote`/`get`/`list` each call the right `leadRepo` method and surface `leadRepo`'s errors unchanged (no business rule duplicated in the service) — `apps/api/test/services/leads.test.ts`
- [X] T010 [P] [GA] Vitest: `leads` tRPC router — `create` input is Zod-validated and maps `ConditionalCheckFailed` to `cause.code: "ALREADY_EXISTS"`; `addNote` rejects text over 4,000 chars (constitution §6); `updateStatus` rejects an unknown status value; `get` returns `NOT_FOUND` for a missing key — `apps/api/test/routers/leads.test.ts`
- [X] T011 [P] [GA] Vitest: `leads.list` forwards `roofAgeMinYears`/`permitStatus`/`radiusMi` to the `LeadIndex` port (same call the map's `search.properties` makes, per research.md) and forwards `assignee`/`status`-only queries to `leadRepo`'s GSI1/GSI2 methods instead — `apps/api/test/routers/leadsList.test.ts`

### Implementation

- [X] T012 [GA] Finalize the `crm-leads` table (GSI1 pk=`assignee`/sk=`createdAt`, GSI2 pk=`status`/sk=`createdAt`) in `infra/lib/crm-data-stack.ts`, least-privilege `grant*` to the API Lambda (builds on T002's skeleton)
- [X] T013 [GA] Define the `LeadRepo` port interface and its DynamoDB implementation (`create`, `updateStatus`, `addNote`, `get`, `listByAssignee`, `listByStatus`) using `TransactWriteItems`, condition expressions per data-model.md — `apps/api/src/adapters/leadRepo.ts` (Data layer; the port interface is what `leadService`, T014, is injected with)
- [X] T014 [GA] Implement the Application-layer `createLeadService(leadRepo: LeadRepo)` factory (`create`, `updateStatus`, `addNote`, `get`, `list`) — `leadRepo` is received as an injected port argument, never imported/instantiated inside the service, per architecture-constitution.md §4 ("Services receive ... `LeadRepo` ... as injected ports"); calls `packages/domain`'s `leadKey`/`isNotInCurrentRun` for pure rules — `apps/api/src/services/leads.ts`. Wire the constructed service into `TrpcContext`'s `createContext` function, alongside the existing `leadIndex` wiring — `apps/api/src/handlers/health.ts` (edit; this is where `createContext` is defined)
- [X] T015 [GA] Implement the `leads` tRPC router (`create`, `updateStatus`, `addNote`, `get`) per contracts/leads.md: Zod-parse input, call `leadService`, map errors to `cause.code` — no business rule inline — `apps/api/src/routers/leads.ts`
- [X] T016 [GA] Implement `leads.list` on the same router: delegate to `leadService.list`, which forwards roof-age/permit/radius filters to the `LeadIndex` port and assignee/status-only queries to the GSIs; compute `notInCurrentRun` per lead at read time — extend `apps/api/src/routers/leads.ts` and `apps/api/src/services/leads.ts`
- [X] T017 [GA] Register the `leads` router on `AppRouter` — `apps/api/src/routers/index.ts`
- [X] T018 [GA] Add Powertools Logger/Tracer/Metrics calls to every `leads` router procedure (constitution §8/XIII) — `apps/api/src/routers/leads.ts`; confirm no owner-name or PII fields are logged (ADR-03 is unrelated to leads but the same no-PII-in-logs rule applies, constitution §12 P0-13)

---

## Group GB: Lead list UI + URL-encoded filters

**Goal**: FR-001 (create entry point), FR-004, FR-005 (AC-4, AC-5) — the lead list is paginated, filterable, URL-shareable, and shows "not in Run {n}" instead of stale data; the lead detail view exposes status/assignee/notes/history.

**Independent test**: With `leads.list`/`leads.get` live (Group GA complete or mocked via MSW), apply a filter combination, confirm the URL encodes it and reopening it reproduces the view; open a lead flagged `notInCurrentRun` and confirm the "not in Run {n}" state renders instead of the signals.

### Tests first (write failing before implementation)

- [X] T019 [P] [GB] Vitest: `leadFilters` URL-state codec round-trips roof-age/permit-status/radius/center through query params, mirroring `apps/web/src/routes/Map/ExploreFilters.state.ts`'s pattern — `apps/web/test/leads/leadFilters.state.test.ts`
- [X] T020 [P] [GB] React Testing Library: `LeadsList` renders an explicit empty state (no leads, or a filter combination matching zero) rather than an error or infinite spinner (edge case) — `apps/web/test/leads/LeadsList.test.tsx`
- [X] T021 [P] [GB] React Testing Library: `LeadDetail` renders `MissingValue`/"not in Run {n}" when `notInCurrentRun` is true, and never renders the signals snapshot as current in that case — `apps/web/test/leads/LeadDetail.test.tsx`
- [X] T022 [P] [GB] React Testing Library (deviation: apps/web has no Playwright component setup, so this is RTL; the hosted-URL Playwright proof stays in the Prove-live stage): `LeadCreateAction` wired into the existing `PropertyDetail` drawer calls `leads.create` and shows "Already a lead" on `ALREADY_EXISTS` — `apps/web/test/leads/LeadCreateAction.test.tsx`

### Implementation

- [X] T023 [GB] `leadFilters.state.ts`: URL-encoded filter state (roof-age min, permit status, radius, center) — `apps/web/src/routes/Leads/leadFilters.state.ts`
- [X] T024 [GB] `LeadsList.tsx`: paginated list consuming `leads.list` via `packages/api-client`, Atlas tokens only, filter UI reusing the map's existing filter components where shared — `apps/web/src/routes/Leads/LeadsList.tsx`
- [X] T025 [GB] `LeadDetail.tsx`: status/assignee/notes/history view consuming `leads.get`, `MissingValue` for `notInCurrentRun` — `apps/web/src/routes/Leads/LeadDetail.tsx`
- [X] T026 [GB] `LeadCreateAction.tsx`: "Create lead" action calling `leads.create`, showing "Already a lead" on `ALREADY_EXISTS` — new file `apps/web/src/routes/Leads/LeadCreateAction.tsx`, wired into the existing drawer at `apps/web/src/routes/Map/PropertyDetail/PropertyDetail.tsx` (edit, add the action point; do not restructure the existing drawer)
- [X] T027 [GB] Register the `/leads` and `/leads/:leadId` routes: edit `apps/web/src/App.tsx` (the app's existing router) and add a "Leads" nav entry in `apps/web/src/components/AppShell.tsx` (path corrected: there is no `AppShell/AppShell.tsx`)

---

## Phase N: Polish & Cross-Cutting Concerns

- [X] T028 [P] No file change — verification only: run `pnpm turbo run lint type-check format` (ESLint, `tsc`, Prettier per the `justfile`'s recipes) across `apps/api`, `apps/web`, `packages/shared`, `packages/domain`; fix any findings in the files they point to
- [x] T029 No new file — manual/scripted run: execute `specs/007-leads/quickstart.md`'s six scenarios locally against a dev deploy (not the final hosted-URL proof — that is Phase D/TZ03) to catch integration issues before the review round; record the outcome in `specs/007-leads/run-log.md` — **Done 2026-10-24:** covered by the hosted e2e (TZ03) on the 007-leads preview, not a separate dev deploy.
- [x] T030 [P] Update `docs/kit-usage.md` with one line for this story's agent usage (mew, metagross, audino) once Group GA/GB are both merged into the branch — **Done 2026-10-24:** B-07 and B-08 rows added to `docs/kit-usage.md`.

---

## Dependencies & Execution Order

1. Phase 1 (Setup) → Phase 2 (Foundational) — both block Group GA and Group GB.
2. Group GA and Group GB may run in parallel once Phase 2 is done — GB's UI can develop against contracts/mocks while GA lands the real backend, per `/speckit-implement`'s "launch both task groups in one message."
3. Within Group GA: tests (T006–T011) before implementation (T012–T018); T013 before T014; T014 before T015/T016; T015/T016 before T017.
4. Within Group GB: tests (T019–T022) before implementation (T023–T027); T023 before T024; T024/T025 before T026/T027.
5. T026 (wire into existing drawer) depends on T015 (`leads.create` exists) and edits B-03's existing `PropertyDetail.tsx` — coordinate to avoid clobbering it; add, don't restructure.
6. Phase N (Polish) runs after both groups are implementation-complete.

## Parallel execution examples

- Within Group GA: T006–T011 in parallel (different test files); then T012 before T013; T013 before T014; T014 before T015/T016; T015/T016 before T017; T018 last.
- Within Group GB: T019–T022 in parallel; then T023 before T024/T025; T024/T025 before T026/T027.
- Across groups: Group GA and Group GB can be delegated to two `metagross` builder subagents in the same `/speckit-implement` message.

## Implementation strategy

MVP = Group GA alone (AC-1/AC-2/AC-3, the independent test in stories/B-07-leads.md: "create a lead from a real property, change its status, add a note, reload the page, confirm persistence and no duplicate"). Group GB (AC-4/AC-5) is required for this story's full scope but is independently testable once GA's contracts exist (mockable via MSW against contracts/leads.md in the interim).

---

## Phase Z: Prove on the hosted runtime (mandatory, always last — run in Phase D of the walkthrough, not by `/speckit-implement`)

**Purpose**: Constitution I, XVI, XXII. The story is not done until these pass.

- [x] TZ01 Run the reviewer agents (`metagross`, `audino`) read-only; record scores in `docs/reviews/CR-B-07.md` (each ≥ 75 or justified) — **Done 2026-10-24:** `metagross` 80, `audino` 78 (both at or above 75) and `/code-review medium`; findings and resolutions in `docs/reviews/CR-B-07.md`. 0 open Critical.
- [x] TZ02 Deploy to the hosted runtime (`pnpm --filter api cdk deploy --all` if the backend changed; Amplify branch preview for `007-leads`); record the preview URL in `specs/007-leads/run-log.md` — **Done 2026-10-24:** CrmData, CrmApi, CrmSync and CrmWeb deployed to eu-north-1; preview `https://007-leads.d1zmhc6kkyzsbe.amplifyapp.com`.
- [x] TZ03 Write and run the Playwright scenario tests at `tests/e2e/B-07.spec.ts` against `RUNTIME_URL` (the `007-leads` Amplify preview, never localhost), one per TC in `testplans/B-07-test-cases.md`; screenshots to `docs/evidence/img/B-07-*.png` — **Done 2026-10-24:** `tests/e2e/B-07.spec.ts`, 60 passed / 3 skipped / 0 failed on the first full 3-viewport run; see `docs/evidence/B-07.md`.
- [x] TZ04 Run `smeargle` responsive-design-tests at 390 / 768 / 1440 on `RUNTIME_URL` for the Leads list and detail screens (UI story); report to `docs/evidence/B-07.md` — **Done 2026-10-24:** covered by TC-NF-04 in `tests/e2e/B-07.spec.ts` at 390 / 768 / 1440 (no horizontal scroll, Atlas token audit) on the hosted list and detail pages; the separate `smeargle` agent was not run because it would repeat that test.
- [x] TZ05 No separate file — this story's `agents.verify` (stories/B-07-leads.md front matter: "Playwright: create, update, reload; URL-encoded combined filters") is the same suite already written at `tests/e2e/B-07.spec.ts` in TZ03; no additional golden-query/coverage-SQL step applies to this story — **Done 2026-10-24:** same suite as TZ03 (create, update, reload; URL-encoded combined filters).
- [x] TZ06 Write `docs/reports/UT-B-07.md`, `docs/evidence/B-07.md` (§ B-08 for the list part), the B-07/B-08 rows of `docs/traceability.md`, and one line in `docs/kit-usage.md` — **Done 2026-10-24:** `docs/reports/UT-B-07.md`, `docs/evidence/B-07.md`, traceability rows and kit-usage lines are written.
