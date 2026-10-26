# Implementation Plan: B-09 Agent + hardening (grounded agent, responsive, observable, real-data switch)

**Branch**: `009-agent-hardening` | **Date**: 2026-10-24 | **Spec**: `specs/009-agent-hardening/spec.md`

**Input**: Feature specification from `/specs/009-agent-hardening/spec.md`

## Summary

Add a tRPC `agent.ask` procedure (Vercel AI SDK, `AI_PROVIDER` switch) that answers plain-language
roofing-opportunity questions with cited, real records from the existing B-02/B-03 property/permit
index, through fixed Zod tools, a server-side citation verifier, and ADR-06's confidence bands for
place resolution. Leads are only ever created through the existing B-07 `leads.create` path, via a
separate `agent.confirmLead` mutation the model cannot reach. This round also: switches the data
source to Task A's published Run 2 manifest, read directly by CID (AC-7, constitution B1), proves the
whole app (old screens + new Ask screens) responsive at 390/768/1440 (AC-5) and re-diffed against
the current prototype (AC-8), and adds a `RoofingCrm` CloudWatch dashboard plus confirms the
existing DLQ alarm is wired to the user's email (AC-6). The technical design for the agent itself
is not new — it reuses the already-accepted ADR-06 (`docs/decisions/0000-agent-architecture.md`),
nothing under which is implemented yet; this story builds it.

## Technical Context

**Language/Version**: TypeScript (Node 22/24, per `docs/decisions/0000-agent-architecture.md` §6.1's Lambda config)

**Primary Dependencies**: `ai` (Vercel AI SDK) + `@ai-sdk/amazon-bedrock` (new deps, not yet in `apps/api/package.json`), `@aws-lambda-powertools/{logger,tracer,metrics}` (existing), `@trpc/server` + Zod (existing), DuckDB-over-Parquet via the existing `LeadIndex` port (existing)

**Storage**: DynamoDB — existing `crm-leads` table (B-07, read via `leads.create`/`leadService`); new `crm-agent-usage` table (rate limit + spend cap, this story); conversation memory + review records as prefixed items, same adapter pattern (`ConversationEventStore`, `INTERP#`/`ALIAS#`/`FEEDBACK#`, ADR-06 §6.1/§7). Property/permit data: existing S3 Parquet index behind `LeadIndex`, built from Task A's published manifest `bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, read directly by CID (AC-7, constitution B1).

**Testing**: Vitest (unit, `MockLanguageModelV2` for the agent loop; `tests/agent/golden.test.ts` for G1–G7 against the deployed endpoint per checks.md §7.2), Playwright against `RUNTIME_URL` only (`tests/e2e/responsive/ask.spec.ts` + existing responsive specs)

**Target Platform**: AWS Lambda (HTTP API v2, tRPC `awsLambdaRequestHandler`) behind Amplify-hosted React web, region `eu-north-1` (demo, region-locked) with Bedrock `eu.` inference profiles

**Project Type**: Web application (Turborepo monorepo: `apps/web`, `apps/api`, shared `packages/*`) — existing structure, no new apps

**Performance Goals**: p95 "first useful answer" < 20s across the 7 golden queries (AC-4); 23s server-side abort; ≤3 model calls/ask (plan, ≤1 repair, compose)

**Constraints**: 5 asks/min/user, $3/day spend cap (checked before the model call, not after); ≤25 compact rows to the model, ≤1,000 full rows to the UI via `resultSetId`; 100% citation groundedness (every cited `property_cid` resolves against the live index); zero fabricated results on out-of-scope questions (AC-3/G6)

**Scale/Scope**: 441,961 properties / 15,025 permits (Run 2 full-county manifest, AC-7); 9 total screens re-diffed for AC-8 (8 existing + new Ask states); 3 breakpoints (390/768/1440) × every `ui:true` screen for AC-5

## Kit Agent Ownership *(mandatory, constitution XIII–XVII)*

Copied from `stories/B-09-agent-hardening.md` front matter and `specs/009-agent-hardening/agent-design.md`.

| Role | Agent(s) | Skills loaded | What it decided (cite agent-design.md) |
|------|----------|---------------|----------------------------------------|
| Design consult | `alakazam` (Opus), `ash`, `smeargle`, `porygon` | `build-rag-systems`, `build-ai-agents`, `responsive-design-tests`, `unify-metrics` | §1: tools/`PlaceResolver`/citation verifier/golden harness design. §2: `agent.ask` shape, `getModel`/`AI_PROVIDER`, 23s abort, rate+spend guard, confirm-flow mechanics. §3: breakpoints reuse, `ask.spec.ts` design, AC-8 sibling plan. §4: agent metrics, DLQ-alarm confirm (no new construct), `RoofingCrm` dashboard widgets, AC-4 as an ongoing 3-layer check. "Corrections" section: ADR-06 confidence bands govern over the story's looser wording; `design/prototype/` not `design/screens/`. |
| Builder | `alakazam` (retrieval) + `ash` (agent runtime) + `metagross` (responsive + observability) | `build-rag-systems`, `build-ai-agents`, `use-elephant-mcp`, `responsive-design-tests`, `unify-metrics`, `build-frontend-backends`, `apply-engineering-guidelines` | `alakazam`: `services/agent/{tools,placeResolver,verifyCitations}.ts`, `packages/shared/src/rag/ports.ts`, `thresholds.ts`, golden harness. `ash`: `apps/api/src/routers/agent.ts`, `apps/api/src/agent/{getModel,runAgent,rateLimiter,spendCap}.ts`, `agentErrors.ts`. `metagross`: `apps/web/src/routes/Ask/*`, `infra/lib/crm-ops-stack.ts` (dashboard), `infra/lib/crm-data-stack.ts` (`crm-agent-usage` table), DLQ-alarm `alarmEmail` confirm, AC-8 fixes. |
| Reviewer(s) | `alakazam`, `ash`, `metagross`, `audino`, `porygon` | — | `alakazam`/`ash` score retrieval + runtime correctness against ADR-06; `audino` scores AC-8 drift fixes; `porygon` scores metric/dashboard consistency; `metagross` scores responsive + overall build. Recorded in `docs/reviews/CR-B-09.md`, each ≥75 before G7. |
| Verify | golden queries G1–G7 (checks.md §7) · full `smeargle` suite at 390/768/1440 · `RoofingCrm` CloudWatch dashboard | — | `tests/agent/golden.test.ts` against the deployed endpoint; `tests/e2e/responsive/*.spec.ts` against the Amplify branch preview; forced DLQ failure + drain, screenshotted both alarm states. |

**Patterns the code must show** (from the builders' answers, each mapped to a path above):
1. Ports before adapters (`PlaceResolver`, `ConversationEventStore`, `LeadIndex` already is one) — `packages/shared/src/rag/ports.ts`.
2. One `QueryPlan` for map and agent, G8-tested for identical `property_cid` sets — `packages/shared/src/agent/queryPlan.ts`.
3. Server-side citation verifier, never trusting model-stated numbers — `services/agent/verifyCitations.ts`.
4. Model sees ≤25 compact rows; UI pages the full set via `resultSetId` — `services/agent/tools.ts`.
5. Suggest-only writes: `proposeLeads` never writes; creation only via `agent.confirmLead` → `leads.create` — `apps/api/src/routers/agent.ts`.
6. Atomic conditional DynamoDB writes for rate/spend guards, same pattern as `leadService`'s `expectedSequence` — `apps/api/src/agent/{rateLimiter,spendCap}.ts`.
7. Reused CSS-module responsive convention (no new `tablet.css`/`compact.css`) — `apps/web/src/routes/Ask/Ask.module.css`.
8. Existing DLQ+alarm construct confirmed wired, not rebuilt — `infra/lib/crm-sync-stack.ts` / `infra/bin/*.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Mark each ✅ / ❌ / N/A; every ❌ needs a row in Complexity Tracking.*

| # | Article | Check for this plan | Status |
|---|---------|---------------------|--------|
| I | Outcome first | Golden queries + responsive suite + dashboard proof run against the Amplify branch preview / `RUNTIME_URL`, never localhost (quickstart.md) | ✅ |
| II–IV | Stack | TypeScript throughout (router, agent runtime, tools, CDK); region read from config, demo `eu-north-1`; existing Turborepo apps, no new app; `packages/api-client` extended with `agent.ask`/`agent.confirmLead`, not a second client | ✅ |
| V–VI | Contracts and LLM | Every tool + procedure input is Zod (`AskInput`, `QueryPlan`, tool schemas); model calls only via `ai` + `@ai-sdk/amazon-bedrock`, selected by `AI_PROVIDER`, model ids from config, never hard-coded | ✅ |
| VII–IX | Operations | No new external queue needed for the agent itself (reads are synchronous tRPC calls, not queued); existing sync-job DLQ + self-resolving alarm (AC-6) confirmed wired to `alarmEmail`; alerting substitute is SNS email (constitution IX's documented substitute, already accepted) | ✅ |
| X | Quality gates | Vitest (unit + golden harness) + Playwright (`tests/e2e/responsive/`) against the hosted URL; ESLint/Prettier/tsc unchanged in CI | ✅ |
| XI | Data honesty | Every `AgentAnswer` citation carries `sourceUrl`/`manifestCid`/`asOf`; missing fields (BBB, contractor in v1) say so (`field_not_published`/"not available"), never guessed; assumption chips show stated vs. defaulted slots | ✅ |
| XII | Secrets | No `AI_GATEWAY`/Bedrock keys in code or logs; tool-call logs carry `argsShape` (keys only), never question text or addresses (P0-13) | ✅ |
| XIII–XV | Owner agents | Kit Agent Ownership table above filled from the story front matter; `agent-design.md` exists with both compiled synthesis and verbatim consult answers (constitution XIV); builder patterns listed with file paths | ✅ |
| XVI | Owner review | `alakazam`, `ash`, `metagross`, `audino`, `porygon` each score the branch in `docs/reviews/CR-B-09.md`, ≥75 before G7 | planned |
| XVIII–XXIII | Delivery | G4 passed (Ready, 2026-10-24); G5/G6 run after `/speckit-tasks`/test-case drafting; tests-first per `tasks.md` (Phase 2); branch `009-agent-hardening`; any hosted-test failure gets `docs/defects/ERR-{n}.md` | planned |
| Addendum | Task B B1–B3 | B1: data read directly from Task A's published manifest by CID (`bafkreife3vk…pcute`), no scraping/ingestion. B2: every lead from the agent still records `sourceManifestCid` via `leads.create`. B3: citation verifier enforces "agent answers cite records that exist in the index; never invents properties." | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/009-agent-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── agent-design.md       # Phase B (constitution XIV): compiled + verbatim design-agent answers
├── contracts/
│   ├── agent-api.md       # agent.ask / agent.confirmLead / tool table
│   └── observability.md   # DLQ alarm confirm, agent metrics, RoofingCrm dashboard
└── tasks.md              # Phase 2 output (/speckit-tasks, not this command)
```

### Source Code (repository root — existing Turborepo monorepo, extended)

```text
apps/api/src/
├── routers/
│   ├── agent.ts                  # NEW — agent.ask, agent.confirmLead (ash)
│   └── index.ts                  # EDIT — add `agent: agentRouter`
├── agent/                        # NEW (ash)
│   ├── getModel.ts                # AI_PROVIDER switch (bedrock | gateway)
│   ├── runAgent.ts                 # tool loop, maxSteps:3, 23s AbortSignal
│   ├── rateLimiter.ts              # 5 asks/min/user, crm-agent-usage conditional write
│   └── spendCap.ts                 # $3/day, pre-call cost estimate
├── agentErrors.ts                 # NEW (ash) — mirrors leadErrors.ts
├── services/agent/                # NEW (alakazam)
│   ├── tools.ts                    # resolvePlace, searchProperties, searchPermits, getProperty, getCoverage, proposeLeads
│   ├── placeResolver.ts            # gazetteer + confidence bands (ADR-06 §5)
│   └── verifyCitations.ts          # server-side citation/number verifier
├── services/search.ts             # NEW — thin-router extraction from routers/search.ts (shared by router + tools)
└── services/propertyDetail.ts     # NEW — thin-router extraction from routers/property.ts

packages/shared/src/
├── agent/
│   ├── queryPlan.ts                # NEW — QueryPlan Zod (ADR-06 §4)
│   ├── answer.ts                   # NEW — AgentAnswer Zod (ADR-06 §4)
│   └── thresholds.ts               # NEW — versioned confidence bands
└── rag/ports.ts                   # NEW — PlaceResolver, ConversationEventStore, ReviewStore, TraceSink ports

apps/web/src/routes/Ask/            # NEW (metagross) — Ask screen + its 7 states, Ask.module.css

infra/lib/
├── crm-data-stack.ts              # EDIT (metagross) — add crm-agent-usage DynamoDB table
├── crm-ops-stack.ts               # EDIT (metagross) — add RoofingCrmDashboard
└── crm-sync-stack.ts              # CONFIRM ONLY — alarmEmail already wired, no new construct

tests/agent/
├── golden.json                     # NEW (alakazam) — G1–G7, checks.md §7.1
└── golden.test.ts                  # NEW (alakazam) — Vitest, runs against RUNTIME_URL
tests/e2e/responsive/
├── ask.spec.ts                     # NEW (metagross/smeargle pattern) — 7 Ask states × 3 breakpoints
└── leads-shell.spec.ts            # NEW if not already covering LeadDetail/LeadsList
```

**Structure Decision**: extend the existing `apps/api` tRPC Lambda and `apps/web` React app — no
new Turborepo app or package beyond new files inside `packages/shared` (agent/rag ports) and
`apps/api/src/{agent,services/agent}`. No new CDK stack; `crm-data-stack.ts`/`crm-ops-stack.ts`
gain new resources, `crm-sync-stack.ts` is checked, not rebuilt. This matches constitution IV
(never duplicate the client or types — `agent.ask`/`agent.confirmLead` ship through the one
existing `packages/api-client`) and the builder split in Kit Agent Ownership above.

## Complexity Tracking

No Constitution Check violations. None of the "planned" rows (XVI, XVIII–XXIII) are violations —
they are steps this plan schedules for later phases (review scoring, G5/G6, tasks-first), not
deviations from an article.
