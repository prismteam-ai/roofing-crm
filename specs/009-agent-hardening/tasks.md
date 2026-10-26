---

description: "Task list for B-09 (009-agent-hardening): grounded agent, responsive + observable, real-data switch, prototype re-audit"
---

# Tasks: B-09 Agent + hardening

**Input**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/agent-api.md`,
`contracts/observability.md`, `quickstart.md`, `agent-design.md` — all in `specs/009-agent-hardening/`

**Prerequisites**: plan.md ✅, spec.md ✅ (5 user stories), research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: MANDATORY (constitution X, XXI, XXII). Every implementation task's tests are listed
first in its phase and must fail before the implementation task runs.

**Builder delegation** (constitution XV): every implementation task is delegated to one of the
three builders named in `stories/B-09-agent-hardening.md`'s front matter —
`soofi-xyz-team-kit:alakazam` (retrieval), `soofi-xyz-team-kit:ash` (agent runtime),
`soofi-xyz-team-kit:metagross` (responsive + observability + UI) — each loading its skills plus
`apply-engineering-guidelines`. The builder owning each task is named in `(builder: ...)` at the
end of the task line; this is in addition to, not instead of, the `[Story]` label the checklist
format requires.

**Organization**: one phase per user story from spec.md, in spec.md's priority order, except
**US4 (the data switch) is sequenced before US1/US2** despite spec.md listing it fourth — US1's and
US2's golden-query tests need to read the Run-2 manifest CID to produce real, checkable answers,
so the data switch is a hard dependency on them, not an independent P1 story in practice. This is
called out again in Dependencies & Execution Order.

## Format: `[ID] [P?] [Story] Description (builder: name)`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (ask + cited answer), US2 (golden queries at scale), US3 (responsive +
  observable), US4 (real-data switch), US5 (prototype match)
- Exact file paths are in every task description

---

## Phase 1: Setup

**Purpose**: dependencies and scaffolding every story needs; no business logic yet.

- [x] T001 [P] Add `ai` and `@ai-sdk/amazon-bedrock` to `apps/api/package.json` dependencies; run `pnpm install` (builder: ash)
- [x] T002 [P] Create `apps/api/src/agent/` and `apps/api/src/services/agent/` directories with empty `.gitkeep`-free placeholder index files so later tasks have a home (builder: ash)
- [x] T003 [P] Create `packages/shared/src/agent/` and `packages/shared/src/rag/` directories (builder: alakazam)
- [x] T004 [P] Create `apps/web/src/routes/Ask/` directory (builder: metagross)
- [x] T005 [P] Create `tests/agent/` directory for the golden harness (builder: alakazam)

**Checkpoint**: directories exist; no code yet.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the shared contracts and ports every story's tests and implementation import. Per
constitution XXI, every test task below must be written and confirmed failing before its paired
implementation task runs. (The confirm-flow import-guard test originally planned here moved to
Phase 4/US1 — see T029 — since it asserts a shape of `services/agent/tools.ts`, a file that
doesn't exist until that phase; a test on a nonexistent file fails on import, not on its intended
assertion, which isn't "failing for the right reason.")

- [x] T006 [P] Write failing unit test for `QueryPlan` Zod shape (area 0.5–25mi radius inclusive bound, `slotSources` enum `stated|default|inherited`, `unsupported[]` reason enum `not_in_export|no_lexicon_carrier|out_of_scope|no_free_text`) in `packages/shared/test/agent/queryPlan.test.ts` (builder: alakazam)
- [x] T007 Implement `QueryPlan` Zod schema per ADR-06 §4 / data-model.md in `packages/shared/src/agent/queryPlan.ts`; make T006 pass (builder: alakazam)
- [x] T008 [P] Write failing unit test for `AgentAnswer` Zod shape (outcome enum `answered|empty_in_scope|out_of_scope|not_found|needs_clarification|field_not_published|timed_out|rate_limited|paused`; every `claims[].citationIds` entry non-empty) in `packages/shared/test/agent/answer.test.ts` (builder: alakazam)
- [x] T009 Implement `AgentAnswer` Zod schema per ADR-06 §4 / data-model.md in `packages/shared/src/agent/answer.ts`; make T008 pass (depends on T007) (builder: alakazam)
- [x] T010 [P] Write failing unit test for the confidence-band function (auto ≥0.92; clarify 0.80–0.92 or margin<0.05 between top-2; refuse/`not_found` <0.80 — ADR-06 §5, the corrected story edge case) in `packages/shared/test/agent/thresholds.test.ts` (builder: alakazam)
- [x] T011 Implement versioned confidence bands in `packages/shared/src/agent/thresholds.ts`; make T010 pass (builder: alakazam)
- [x] T012 [P] Extract the existing `search.properties`/`search.permits` logic (currently inline in `apps/api/src/routers/search.ts`) into `apps/api/src/services/search.ts`, with `routers/search.ts` calling the new service; all existing `apps/api/test/routers/search.test.ts`/`apps/api/test/search.*.test.ts` must still pass unchanged (builder: alakazam)
- [x] T013 [P] Extract the existing `property.get` logic (currently inline in `apps/api/src/routers/property.ts`) into `apps/api/src/services/propertyDetail.ts`, with `routers/property.ts` calling the new service; all existing `apps/api/test/property.get.test.ts` must still pass unchanged (builder: alakazam)
- [x] T014 [P] Define the `PlaceResolver`, `ConversationEventStore`, `ReviewStore`, `TraceSink` port interfaces (ADR-06 §10 pattern #1, no adapters yet) in `packages/shared/src/rag/ports.ts` (builder: alakazam)
- [x] T015 [P] Write failing unit test for the `crm-agent-usage` rate-limit conditional write (5 asks/min/user: 6th concurrent call in the same window must fail the condition) in `apps/api/test/agent/rateLimiter.test.ts` (builder: ash)
- [x] T016 [P] Write failing unit test for the `crm-agent-usage` spend-cap conditional write ($3/day = 300 cents; a call estimated to exceed the remaining cents must fail the condition, checked before any model call) in `apps/api/test/agent/spendCap.test.ts` (builder: ash)
- [x] T017 Add the `crm-agent-usage` DynamoDB table (PK `USER#{sub}#MIN#{windowMinute}` and `USER#{sub}#DAY#{yyyy-mm-dd}` item shapes, data-model.md) to `infra/lib/crm-data-stack.ts`, granted read/write to the API Lambda in `infra/lib/crm-api-stack.ts` (builder: ash)
- [x] T018 Implement `apps/api/src/agent/rateLimiter.ts` and `apps/api/src/agent/spendCap.ts` against the table from T017 using the same atomic conditional `UpdateItem` pattern as `leadService`'s `expectedSequence` (`apps/api/src/services/leads.ts`); make T015/T016 pass (depends on T017) (builder: ash)
- [x] T019 Implement `apps/api/src/agentErrors.ts` (typed errors mirroring `apps/api/src/leadErrors.ts`: `RateLimitedError`, `OverBudgetError`, `IndexNotReadyError` re-export) (builder: ash)

**Checkpoint**: shared schemas, ports, thin-router services, and the usage-guard table/logic exist
and are tested. No story's user-facing behavior exists yet.

---

## Phase 3: User Story 4 — See the real county dataset, not a small sample (Priority: P1, sequenced first — see Organization note)

**Goal**: CRM and agent read property/permit data directly from Task A's published Run 2
full-county manifest, by CID (AC-7, FR-007, constitution B1).

**Independent Test**: confirm the data shown in the CRM and returned by the agent traces to
manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, not the earlier 35-row sample.

### Tests for User Story 4 (write first)

- [x] T020 [P] [US4] Write a failing integration test asserting `leadIndex.indexInfo().manifestCid === "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute"` against the deployed index, in `apps/api/test/leadIndex.manifestCid.test.ts` (builder: alakazam)

### Implementation for User Story 4

- [x] T021 [US4] Make `DATA_MANIFEST_CID` the authoritative manifest for the sync and start one sync automatically on a deploy that changes it (auto-sync, PO decision); size the sync Lambdas (memory, `/tmp`, timeout) for the full county (~556 MB of parts); replace the hard-coded manifest CID in `apps/api/src/routers/agent.ts` with the promoted run's; then deploy with the Run 2 CID so T020 passes (builder: metagross)

**Deferred (PO):** following Task A's incremental-run chain (`previousManifestCid`, Run 3+) — see the story's Out of scope. Not built in this story.
- [x] T022 [US4] Confirm constitution B1 and `docs/architecture-constitution.md` §7 describe the data path as built: the CRM reads Task A's published manifest and parts directly by CID, manifest set by `DATA_MANIFEST_CID` — per AC-7/FR-007 (builder: alakazam)
- [x] T023 [US4] Confirm `apps/web`'s existing map/leads screens show the manifest CID in their provenance UI (constitution XI) without code changes if already wired from B-03/B-07, or add the display if missing, in `apps/web/src/routes/Map`/`apps/web/src/routes/Leads` (builder: metagross)

**Checkpoint**: the whole app, including every story below, now reads the real 441,961-property /
15,025-permit dataset.

---

## Phase 4: User Story 1 — Ask a plain-language roofing-opportunity question (Priority: P1) 🎯 MVP

**Goal**: a rep asks a natural-language question and gets a grounded, cited answer with openable
map results; creating a lead from it goes through the existing `leads.create` path; an
out-of-scope question gets an honest empty/invalid-scope answer, never fabricated results (AC-1,
AC-2, AC-3, FR-001–FR-003).

**Independent Test**: with B-07 leads live, ask the deployed agent "open roofing permits older
than five years within five miles of Pflugerville," confirm it states the geocoded center point,
returns real cited records, opens a result on the map, and create-a-lead-from-the-answer appears
in the lead list.

### Tests for User Story 1 (write first)

- [x] T024 [P] [US1] Write a failing unit test for `resolvePlace`/place-confidence scoring (exact match = 1.0; a misspelling like "Pflugervile" scores in the fuzzy range; two close candidates trigger the margin<0.05 clarify band) in `apps/api/test/services/agent/placeResolver.test.ts` (builder: alakazam)
- [x] T025 [P] [US1] Write a failing unit test for the server-side citation verifier: a `citationIds` entry not present in this turn's tool results is stripped, and when no claims remain a deterministic template answer is returned instead (ADR-06 §5) in `apps/api/test/services/agent/verifyCitations.test.ts` (builder: alakazam)
- [x] T026 [P] [US1] Write a failing unit test using `MockLanguageModelV2` for the full `agent.ask` tool loop: plan → `resolvePlace` → `searchProperties` → compose → verify, asserting `modelCalls <= 3` and that a planted fake `property_cid` in the mocked compose output never reaches the returned `AgentAnswer.claims` in `apps/api/test/routers/agent.ask.test.ts` (builder: ash)
- [x] T027 [P] [US1] Write a failing unit test for `agent.ask` on an out-of-scope ZIP (99999): asserts `outcome === "out_of_scope"`, zero `results`/`claims`, no model compose call made, in `apps/api/test/routers/agent.outOfScope.test.ts` (builder: ash)
- [x] T028 [P] [US1] Write a failing unit test for `agent.confirmLead`: asserts it calls `requireLeadService(ctx).create(...)` with `createdFrom: "agent"` and `sourceManifestCid` set to the pinned CID, and that `apps/api/src/services/agent/tools.ts` has no code path reaching the same call (ties to T029) in `apps/api/test/routers/agent.confirmLead.test.ts` (builder: ash)
- [x] T029 [P] [US1] Write a failing unit test asserting `apps/api/src/services/agent/tools.ts` imports neither `LeadService` nor `requireLeadService` — the confirm-flow-bypass guard from `agent-design.md` ash §5 — in `apps/api/test/services/agent/toolsImportGuard.test.ts`. (Sequenced here, not in Phase 2, because it tests a file — `tools.ts` — that this phase creates; a guard test on a file that doesn't exist yet would fail on import, not on its intended assertion.) (builder: ash)

### Implementation for User Story 1

- [x] T030 [US1] Implement `apps/api/src/services/agent/placeResolver.ts`: normalise → exact/alias (score 1.0) → Jaro-Winkler fuzzy over `packages/oracle-views/gazetteer/travis-places@1.0.0` (−0.05 margin penalty when top-2 candidates are within 0.05) → confidence bands from T011; make T024 pass (depends on T011, T014) (builder: alakazam)
- [x] T031 [US1] Implement `apps/api/src/services/agent/verifyCitations.ts`: every `claims[].citationIds` entry must resolve against this turn's own tool-result set and against a batch `leadIndex.getProperty` call for the current `manifestCid`; strip failing claims; fall back to a deterministic counts-based template when none remain; make T025 pass (depends on T009) (builder: alakazam)
- [x] T032 [US1] Implement `apps/api/src/services/agent/tools.ts`: `resolvePlace`, `searchProperties`, `searchPermits`, `getProperty`, `getCoverage`, `proposeLeads` Zod tool defs per `contracts/agent-api.md`'s tool table, calling T012/T013's services and T030's resolver — `proposeLeads` reads only (`getProperty` + dup-check against `crm-leads`), writes nothing; make T029 pass (depends on T012, T013, T030) (builder: alakazam)
- [x] T033 [US1] Implement `apps/api/src/agent/getModel.ts`: `AI_PROVIDER` switch returning the Bedrock `eu.` inference-profile model (`bedrock`) or the Vercel AI Gateway model id (`gateway`); throws on any other value; model ids read from config, never hard-coded beyond the switch per constitution VI (builder: ash)
- [x] T034 [US1] Implement `apps/api/src/agent/runAgent.ts`: the tool loop via the AI SDK's `generateText({model, tools, maxSteps: 3, abortSignal})`, a 23s `AbortController`/`setTimeout`, catch mapping `AbortError` → `{outcome: "timed_out"}` (never rethrown as a 500, same pattern as `mapIndexNotReady` in `apps/api/src/routers/search.ts`); make T026 pass (depends on T032, T033) (builder: ash)
- [x] T035 [US1] Implement `apps/api/src/routers/agent.ts`'s `agent.ask` procedure per `contracts/agent-api.md`: `AskInput` Zod (`question` 1–500 chars trimmed, `threadId`), budget check (T018) before any model call, scope/confidence short-circuit to `out_of_scope`/`not_found`/`needs_clarification` with no compose call, then T034's loop, then T031's verifier; make T027 pass (depends on T018, T030, T031, T034) (builder: ash)
- [x] T036 [US1] Implement `agent.confirmLead` in `apps/api/src/routers/agent.ts`: calls `requireLeadService(ctx).create(input, requireUserId(ctx))` exactly as `leads.ts` does, `createdFrom: "agent"`, `sourceManifestCid` the pinned CID; make T028 pass (depends on T035) (builder: ash)
- [x] T037 [US1] Wire `agent: agentRouter` into `apps/api/src/routers/index.ts`'s `appRouter` (builder: ash)
- [x] T038 [US1] Add `agent.ask`/`agent.confirmLead` types to `packages/api-client` (the one existing tRPC client, constitution IV — no second client) (builder: ash)
- [x] T039 [P] [US1] Build the `apps/web/src/routes/Ask/Ask.tsx` screen and `Ask.module.css` (following the existing 600px rail-breakpoint CSS-module convention from `AppShell.module.css`/`Map.module.css`, per `agent-design.md` smeargle §1): question input, "Working…" state, answer-with-citations rendering, open-on-map action, create-lead confirmation card calling `agent.confirmLead` (depends on T038) (builder: metagross)
- [x] T040 [US1] Add a `data-state` attribute to the Ask screen's root element for each outcome (`working|answer|no_results|low_confidence|throttled|paused`, per `agent-design.md` smeargle §4) so Playwright and manual QA can assert state deterministically (builder: metagross)

**Checkpoint**: a rep can ask a question on the hosted URL and get a grounded, cited answer; AC-1,
AC-2, AC-3 are independently testable and demoable (MVP).

---

## Phase 5: User Story 2 — Trust the agent and the app at scale (Priority: P1)

**Goal**: the seven golden questions (checks.md §7.1) run against the live agent with fast,
grounded, citation-backed answers (AC-4, FR-004).

**Independent Test**: run all seven golden queries against the deployed endpoint; record latency
and citation accuracy for each.

### Tests for User Story 2 (write first)

- [x] T041 [US2] Write `tests/agent/golden.json` with the exact G1–G7 prompts and pass rules from checks.md §7.1 (builder: alakazam)
- [x] T042 [US2] Write `tests/agent/golden.test.ts` (Vitest) calling `agent.ask`/`agent.confirmLead` over `RUNTIME_URL` (refuses localhost) as a Cognito eval user, 3 repeats paced 13s apart; per-query assertions: groundedness (100% of cited `property_cid`s resolve, `manifestCid` matches the pinned CID), correctness (re-run `search.properties`/`search.permits` with the stated center/thresholds, results ⊆ that set, recall ≥80%), honesty (center/thresholds stated in text, "BBB not available" shown correctly for G2/G5), G6 zero-fabrication, G7 lead round-trip via `leads.list`; latency assertion p95 < 20s, max < 23.5s (depends on T041) — this test is expected to fail until Phase 4 is deployed (builder: alakazam)

### Implementation for User Story 2

- [x] T043 [US2] Add `ownerAreaClass`/`tenureYearsMin` optional fields to `SearchPropertiesQuery` in `apps/api/src/adapters/duckDbParquet.ts` (needed for G4's "owners outside the area" filter); extend `searchProperties` tool input accordingly in `apps/api/src/services/agent/tools.ts` (depends on T032) (builder: alakazam)
- [x] T044 [US2] Add `permitNumber` optional field to `SearchPermitsQuery` in `apps/api/src/adapters/duckDbParquet.ts` (needed for G5's exact-permit lookup); extend `searchPermits` tool input accordingly (depends on T032) (builder: alakazam)
- [x] T045 [US2] Add Bedrock prompt caching (cache points on the system prompt and the last non-system message, per ADR-06 §6.1) to `apps/api/src/agent/runAgent.ts`'s Bedrock path, logging cache read/write token counts in the trace; keeps p95 under budget at the 442k-row scale (depends on T034) (builder: ash)
- [x] T046 [US2] Add the `AgentAsksTotal`, `AgentAnswerLatencyMs`, `AgentModelCallsTotal`, `AgentCitationsTotal`, `AgentCitationsVerified`, `AgentCitationGroundednessRate` metric constants to `packages/observability/src/index.ts`'s `METRIC_NAMES`, and emit them from `apps/api/src/routers/agent.ts` per request via the existing `obs.metrics.addMetric(...)` pattern used in `apps/api/src/routers/leads.ts` (contracts/observability.md) (builder: metagross)
- [x] T047 [US2] Run T042 against the deployed agent; commit results to `docs/evidence/B-09.md` (depends on Phase 4 deploy, T042) (builder: alakazam)

**Checkpoint**: all 7 golden queries pass on the hosted endpoint with evidence recorded.

---

## Phase 6: User Story 3 — See a trustworthy app on any device, with visible health signals (Priority: P2)

**Goal**: every screen (old and new) passes the responsive suite at 390/768/1440; a DLQ failure
alerts and later self-clears, visible on a dashboard (AC-5, AC-6, FR-005, FR-006).

**Independent Test**: run the full responsive suite against the hosted URL at 3 widths; separately
force a processing failure and confirm the alert fires and later clears, both on the dashboard.

### Tests for User Story 3 (write first)

- [x] T048 [P] [US3] Write `tests/e2e/responsive/ask.spec.ts` following `tests/e2e/responsive/map-shell.spec.ts`'s exact shape (`signIn()` helper, `document.fonts.ready`) at the 390/768/1440 Playwright projects against `baseURL=RUNTIME_URL`: no horizontal overflow (`scrollWidth<=clientWidth`), correct compact/rail control visibility swap, bounding-box containment, `atlasTokenAudit` pass, asserted per Ask `data-state` from T040 (working/answer/no_results/low_confidence/throttled/paused) — expected to fail until T039/T040 are deployed (builder: metagross)
- [x] T049 [P] [US3] Write `tests/e2e/responsive/leads-shell.spec.ts` if LeadDetail/LeadsList aren't already covered by an existing responsive spec (check `tests/e2e/responsive/map-shell.spec.ts` first — it only covers Map+AppShell per `agent-design.md` smeargle §2) (builder: metagross)
- [x] T050 [US3] Write a failing CDK-assertions test confirming `infra/lib/crm-sync-stack.ts`'s `CrmSyncStack` is composed with `alarmEmail: "eng.heba.gaber@gmail.com"` wherever it's instantiated in `infra/bin/*.ts`, in `infra/test/crm-sync-stack.alarmEmail.test.ts` (builder: metagross)
- [x] T051 [US3] Write a failing CDK-assertions test confirming `infra/lib/crm-ops-stack.ts` creates a `cloudwatch.Dashboard` named `RoofingCrm`, in `infra/test/crm-ops-stack.dashboard.test.ts` (builder: metagross)

### Implementation for User Story 3

- [x] T052 [US3] Fix `infra/bin/*.ts`'s `CrmSyncStack` instantiation to pass `alarmEmail: "eng.heba.gaber@gmail.com"` if missing; make T050 pass — per `agent-design.md` porygon §2, no new DLQ/alarm construct needed, `addFetchPartDlqAndAlarm()` already exists (builder: metagross)
- [x] T053 [US3] Add `cloudwatch.Dashboard(this, "RoofingCrmDashboard", {dashboardName: "RoofingCrm"})` to `infra/lib/crm-ops-stack.ts` with widgets: DLQ depth (`fetchPartDlq.metricApproximateNumberOfMessagesVisible()`), `AlarmStatusWidget` for `FetchPartDlqAlarm`, `AgentAnswerLatencyMs` p95, `AgentCitationGroundednessRate` (target line 100), `GoldenQueryPassRate`; make T051 pass (depends on T046, T052) (builder: metagross)
- [x] T054 [US3] Add a `GoldenQueryPassRate` custom-metric `PutMetricData` call to the end of `tests/agent/golden.test.ts` (or a thin wrapper script run after it in CI) so the dashboard widget trends real runs, per contracts/observability.md's "continuous AC-4 check" (depends on T042, T053) (builder: metagross)
- [x] T055 [US3] Add a CloudWatch alarm on `AgentCitationGroundednessRate < 100` for N periods, subscribed to the same SNS topic as the DLQ alarm, in `infra/lib/crm-ops-stack.ts` (depends on T046, T052) (builder: metagross)
- [x] T056 [US3] Make T048/T049 pass: fix any overflow/visibility/token-audit failures found (builder: metagross)
- [x] T057 [US3] Force a sync-job failure to land a message on `FetchPartDlq`, screenshot the `RoofingCrm` dashboard alarm transitioning ALARM→OK as the queue drains, for `docs/evidence/B-09.md` (depends on T053) (builder: metagross)

**Checkpoint**: full responsive suite green on the hosted URL; DLQ alarm fires and self-resolves,
visible on the `RoofingCrm` dashboard with evidence captured.

---

## Phase 7: User Story 5 — The app matches the approved design, everywhere (Priority: P2)

**Goal**: every screen — old and new — is re-diffed against the current prototype; every mismatch
found is fixed or explicitly deferred with a reason (AC-8, FR-008).

**Independent Test**: re-diff every app screen (existing and new) against
`design/prototype/CrmAsk*.dc.html` and the existing screen prototypes; confirm every mismatch found
is fixed or logged with an explicit reason.

### Tests for User Story 5 (write first)

- [x] T058 [US5] Add a re-diff checklist row per screen (CrmMap, FilterSheet, PropertyDetail, ContractorBadge, ResultsPanel, LeadsList, LeadDetail, AppShell/NavRail, plus the new Ask states) to `design/design-review-log.md`, each starting "Not yet re-checked" (builder: metagross, consult: audino)

### Implementation for User Story 5

- [x] T059 [US5] Re-diff every screen in T058's checklist against `design/prototype/CrmAsk*.dc.html` (corrected path, per `agent-design.md` correction #2) and the existing screen prototypes; fix spacing/token/copy/missing-state mismatches directly in the relevant `.module.css`/`.tsx` files, or mark deferred with a reason in `design/design-review-log.md` (depends on T039, T056, T058) (builder: metagross, consult: audino)
- [x] T060 [US5] Re-run T048/T049 (and `tests/e2e/responsive/map-shell.spec.ts`, `leads-shell.spec.ts`) once, after T059's fixes land — not before, per `agent-design.md` smeargle §4 ("avoid proving a stale layout") (depends on T059) (builder: metagross)

**Checkpoint**: zero unresolved visual mismatches other than ones explicitly logged as deferred.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: cleanup and a local sanity pass, after all 5 stories are implementation-complete and
before the hosted-runtime proof in Phase Z (same ordering B-07 used: `specs/007-leads/tasks.md`'s
Phase N runs before its Phase Z).

- [x] TN01 [P] Run `/simplify` over the diff (R1 sweep, ran inside B-09 before the release steps moved to `docs/pending-items.md`)
- [x] TN02 Run `pnpm --filter @crm/shared --filter @crm/domain --filter @crm/api --filter @crm/web test` full suite; fix any regression
- [x] TN03 Run `quickstart.md`'s steps 1 locally as a final sanity pass before deploying (steps 2–5 are the hosted-runtime proof, done in Phase Z below, not duplicated here)

---

## Phase Z: Prove on the hosted runtime (mandatory, always last)

**Purpose**: constitution I, XVI, XXII. The story is not done until these pass.

- [x] TZ01 Run the reviewer agents (`alakazam`, `ash`, `metagross`, `audino`, `porygon`) read-only against the final branch; record scores in `docs/reviews/CR-B-09.md` (each ≥75 or justified)
- [x] TZ02 Deploy to the hosted runtime (`npx cdk deploy` + Amplify branch push); record the preview URL
- [x] TZ03 Run the Playwright scenario tests (one per TC in `testplans/B-09-test-cases.md`, tagged `@scenario:B-09-TC-nnn`) against `RUNTIME_URL`; screenshots to `docs/evidence/img/`
- [x] TZ04 Run the full `smeargle` suite (`tests/e2e/responsive/*.spec.ts`) at 390/768/1440 on the hosted URL
- [x] TZ05 Run the story's `agents.verify` check: golden queries G1–G7 (T042/T047) + `RoofingCrm` dashboard check (T057)
- [x] TZ06 Write `docs/reports/TR-B-09.md`, `docs/evidence/B-09.md`, the `docs/traceability.md` row, and one `docs/kit-usage.md` line per agent used
- [x] TZ07 Update `docs/progress.md` via `bash scripts/progress.sh` — only after the user approves G7 and the branch is merged `--no-ff` into `feature/roofing-crm` (constitution XX); not part of the pre-merge build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. Blocks every user-story phase.
- **US4 (Phase 3)**: depends on Foundational only. **Must complete before US1/US2** (Phase 4/5),
  even though all three are nominally P1 — US1/US2's golden-query and citation tests need to run
  against the real manifest CID to be meaningful, not the 35-row sample.
- **US1 (Phase 4)**: depends on Foundational + US4.
- **US2 (Phase 5)**: depends on US1 (reuses `agent.ask`/`agent.confirmLead`, adds schema fields
  and caching on top) + US4.
- **US3 (Phase 6)**: depends on Foundational + US1 (needs the Ask screen/states from T039/T040 to
  write `ask.spec.ts` against, and the agent metrics from T046 for the dashboard) — not on US2.
- **US5 (Phase 7)**: depends on US1 (Ask screen must exist to re-diff) + US3 (re-diff fixes land in
  the same CSS modules US3's responsive suite asserts against, so it runs last and US3's suite
  re-runs once after).
- **Phase N**: depends on all 5 story phases being implementation-complete.
- **Phase Z**: depends on Phase N (mandatory, always last).

### Parallel Opportunities

- All Phase 1 tasks (T001–T005) run in parallel.
- Within Phase 2: T006/T008/T010/T015/T016 (tests) run in parallel; T012/T013/T014 (service
  extractions + ports) run in parallel once their paired tests exist.
- Within Phase 4: T024–T029 (tests) run in parallel; T039 (Ask UI) can start in parallel with
  T030–T038 (API side) since it only needs the `packages/api-client` types (stub them from
  `contracts/agent-api.md` first if T038 isn't done yet).
- US3 (Phase 6) and US2 (Phase 5) can run in parallel once US1 (Phase 4) is done — US3 doesn't
  depend on US2.

## Parallel Example: Phase 2 Foundational

```bash
# Launch all Phase 2 test-writing tasks together:
Task: "Write failing unit test for QueryPlan Zod shape in packages/shared/test/agent/queryPlan.test.ts"
Task: "Write failing unit test for AgentAnswer Zod shape in packages/shared/test/agent/answer.test.ts"
Task: "Write failing unit test for the confidence-band function in packages/shared/test/agent/thresholds.test.ts"
Task: "Write failing unit test for the crm-agent-usage rate-limit conditional write in apps/api/test/agent/rateLimiter.test.ts"
Task: "Write failing unit test for the crm-agent-usage spend-cap conditional write in apps/api/test/agent/spendCap.test.ts"
```

## Implementation Strategy

### MVP First (User Story 4 + User Story 1 only)

1. Phase 1: Setup
2. Phase 2: Foundational (blocks everything)
3. Phase 3: US4 (real data switch) — needed for any answer to be checkable as real
4. Phase 4: US1 (ask + cited answer + create lead) — **STOP and demo**: this alone proves the
   README's headline agent capability (D-7) on real data.

### Incremental Delivery

1. Setup + Foundational + US4 + US1 → MVP demoable.
2. Add US2 (golden-query scale proof) → the primary evaluation point (B5) is provable.
3. Add US3 (responsive + observable) → the secondary evaluation point (B6) is provable; can build
   in parallel with US2 once US1 is done.
4. Add US5 (prototype re-audit) → zero unresolved visual drift; runs last since it re-diffs US1's
   and US3's output.
5. Phase N (polish, `/simplify`, full local test suite) → Phase Z (deploy, reviewer scores, hosted
   proof, evidence) — always the final phase.

---

## Phase 9: Convergence

- [x] T061 Add a "Run 2 sync" section to `docs/evidence/B-09.md`: the `index_meta` values (propertyCount 441961, permitCount 15025, permit reconcile result), parts fetched versus listed (130 of 225 and why), and the source of the 2,362 excluded trade sub-permits, each with the commands that reproduce it per SC-005 (partial)
- [x] T062 Add 360, 600 and 1280 px no-horizontal-scroll checks (`scrollWidth <= innerWidth`) on the map, the phone Filters sheet, the AI panel and the list view to `tests/e2e/responsive/layout.spec.ts`, then run them on the hosted URL per FR responsive and Constitution responsive article (partial)
- [x] T063 Re-measure B-07-TC-NF-01 (lead create to list, p95 at most 2,000 ms) on the hosted URL with the keep-warm rule active and record the three viewport samples in `docs/evidence/B-07.md`; the last CI sample was 1.75 s, 1.84 s and 2.03 s with the browser, not the API, as the main cost (partial)
