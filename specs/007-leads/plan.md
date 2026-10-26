# Implementation Plan: Create, manage and browse CRM leads

**Branch**: `007-leads` | **Date**: 2026-10-24 | **Spec**: [specs/007-leads/spec.md](spec.md)

**Input**: Feature specification from `specs/007-leads/spec.md`

## Summary

Add a DynamoDB-backed lead store (`crm-leads` table) with conditional-write dedupe keyed by `{fips}:tcad:{request_identifier}` (ADR-04), gapless event-sourced history, and a signals snapshot; expose it through four tRPC procedures (`leads.create`, `leads.updateStatus`, `leads.addNote`, `leads.list`); and build a paginated, URL-filterable lead list UI reusing the map's roof-age/permit/radius filters. "Not in Run {n}" is computed at read time against the existing `META#index` pointer — no new stored field, no new scheduled job.

## Technical Context

**Language/Version**: TypeScript (constitution Article II)

**Primary Dependencies**: tRPC (existing `AppRouter`), AWS SDK v3 DynamoDB client (`TransactWriteItems`), React + existing `packages/ui` (Atlas tokens), existing `packages/domain`, `packages/api-client`

**Storage**: DynamoDB table `crm-leads` (new), item shapes per `agent-design.md` (pk/sk, GSI1 assignee, GSI2 status). Roof-age/permit-status/radius filters read from the existing DuckDB/Parquet search index (`LeadIndex`/search port), not DynamoDB.

**Testing**: Vitest (unit: domain rules, services), Playwright against the hosted/preview URL (e2e per AC), a concurrency test (20 simultaneous `leads.create` for one key)

**Target Platform**: AWS `eu-north-1` (Lambda behind API Gateway, Amplify Hosting for the web app)

**Project Type**: Web application (existing Turborepo: `apps/web`, `apps/api`, `packages/*`)

**Performance Goals**: Lead appears in the list ≤ 2 s after creation (AC-1/SC-001); list/map filtered counts agree (AC-4/SC-004)

**Constraints**: Duplicate create refused 100% incl. 20 concurrent creates, exactly 1 winner, 0 lost updates (architecture constitution §10 "Lead integrity"); note ≤ 4,000 chars (§6); every tRPC input Zod-validated behind the Cognito JWT authorizer (§12 P0-11)

**Scale/Scope**: 50+ leads across Travis County for the filtered-list AC; single shared test user (no multi-rep access control in this story)

## Kit Agent Ownership *(mandatory, constitution XIII–XVII)*

Copied from the story front matter (`stories/B-07-leads.md`) and `specs/007-leads/agent-design.md`.

| Role | Agent(s) | Skills loaded | What it decided (cite agent-design.md) |
|------|----------|---------------|----------------------------------------|
| Design consult | `mew`, `metagross` | `use-neutral-lexicon`, `build-frontend-backends` | mew: confirmed lead key `{fips}:tcad:{request_identifier}` and gapless `EVT#{sequence}` event model, no mutable staleness field. metagross: `crm-leads` table shape (`sk=LEAD`/`EVT#{n}`/`SIGNALS`), GSI1=assignee, GSI2=status (Round 1 D-1), tRPC procedure set, URL-encoded filter UI with Atlas `FilterChip`/`DataChip`/`MissingValue`. No disagreements recorded. |
| Builder | `metagross` | `build-frontend-backends`, `use-neutral-lexicon`, `frontend-bug-fix` + `apply-engineering-guidelines` | Patterns below |
| Reviewer(s) | `metagross`, `audino` | — | Lead key/dedupe transaction fidelity to ADR-04; Atlas token usage in the lead UI; UI drift from the design prototypes |
| Verify | Playwright | — | create, duplicate-refusal, status/note persistence across reload, combined URL filters, "not in Run {n}", 20-concurrent-create test — all against the hosted preview URL |

**Patterns the code must show** (from the builder's answer):
- `TransactWriteItems` conditional dedupe on `pk`, never read-then-write — `apps/api/src/adapters/leadRepo.ts` (new, Data layer)
- Gapless `EVT#{sequence}` append, condition-checked against current max — same file
- tRPC routers delegate only, no business rule inline — `apps/api/src/routers/leads.ts` (new) calls the Application service `apps/api/src/services/leads.ts` (new). Per architecture-constitution.md §4 ("Services receive `LeadIndex`, `LeadRepo`, `Clock`, `Llm`, `PlaceResolver`, `MetricsSink` as injected ports"), `leadService` is a factory taking a `LeadRepo` port as a constructor/function argument (constructed once in the Lambda handler's `createContext`, alongside the existing `LeadIndex` wiring) — it never imports or instantiates `apps/api/src/adapters/leadRepo.ts` directly. Domain rules come from `packages/domain/src/leads.ts` (new, pure rules), per §4/§9's layering (Entry → Application → Domain → Data)
- URL-state filter codec shared with the map's existing pattern — `apps/web/src/routes/Leads/leadFilters.state.ts` (new), mirroring `apps/web/src/routes/Map/ExploreFilters.state.ts` (web-layer state, not `packages/domain` — the map's existing codec lives in the web app, not domain, and this story follows that precedent)
- Atlas-only components, `MissingValue` for "not in Run {n}", no fetch/business logic inside `packages/ui` components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design. Mark each ✅ / ❌ / N/A; every ❌ needs a row in Complexity Tracking.*

| # | Article | Check for this plan | Status |
|---|---------|---------------------|--------|
| I | Outcome first | Proven on the hosted preview URL (Amplify branch `007-leads`) with real Travis County leads created from the live map drawer | ✅ |
| II–IV | Stack | TypeScript only; no new CDK stack needed (existing `CrmData`/`CrmApi` stacks gain a table + routes, region from config `eu-north-1`); Turborepo layout reused (`apps/api`, `apps/web`, `packages/domain`, `packages/api-client`, `packages/ui`) | ✅ |
| V–VI | Contracts and LLM | Zod on every new tRPC input (`leads.create`/`updateStatus`/`addNote`/`list`); no LLM call in this story (agent integration is B-09) | ✅ |
| VII–IX | Operations | No new queued external boundary (DynamoDB transactions are synchronous, not a sync-style queue); Powertools Logger/Tracer/Metrics on the new Lambda routes; no new alarm needed (reuses existing dashboard) | ✅ |
| X | Quality gates | Vitest (domain rules, repo unit tests with DynamoDB Local or mocked client), Playwright against the hosted preview, lint/tsc/format in CI | ✅ |
| XI | Data honesty | Every lead's signals snapshot carries its `sourceManifestCid`; "not in Run {n}" shown explicitly instead of stale/invented data; no owner name touched (unrelated to ADR-03) | ✅ |
| XII | Secrets | None introduced | ✅ |
| XIII–XV | Owner agents | Kit Agent Ownership filled above; `specs/007-leads/agent-design.md` exists (mew + metagross, both saved verbatim); builder patterns listed above | ✅ |
| XVI | Owner review | `metagross` + `audino` score in `docs/reviews/CR-B-07.md` before G7, threshold 75 | ✅ (planned, not yet run) |
| XVIII–XXIII | Delivery | G4 passed (story `status: Ready`); G5/G6 pre-checks run after this plan+tasks; tests written first (Phase Z pattern); branch `007-leads`; any failing hosted test becomes `docs/defects/ERR-{n}.md` | ✅ (in progress) |
| Addendum | Task B (B2, B1 partially — no Task A ingestion here) | B2: leads are the CRM's own DynamoDB data, every lead records `sourceManifestCid`. B1 (Oracle-only data access) does not apply to new writes in this story — leads reference existing property/permit identities already fetched under B1's boundary by B-01/B-02/B-03; this story adds no new external data source | ✅ |

**Post-design re-check**: No changes to the table above after Phase 1 (data-model.md/contracts/ below) — the design consults already fixed the shape before this plan was written, so Phase 1 formalizes rather than discovers.

## Project Structure

### Documentation (this feature)

```text
specs/007-leads/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (leads.create/updateStatus/addNote/list contracts)
├── agent-design.md      # mew + metagross consults (already written, Phase A/B)
└── tasks.md             # Phase 2 output (/speckit-tasks, not this command)
```

### Source Code (repository root)

**Structure Decision**: Existing Turborepo web application (`apps/web`, `apps/api`, `packages/*`). This story adds files to the existing layout; it does not introduce a new app or package.

```text
apps/api/
├── src/routers/leads.ts            # new: leads.create / updateStatus / addNote / list / get — Zod parse + delegate only
├── src/services/leads.ts           # new: Application layer — orchestrates leadRepo + packages/domain rules (architecture-constitution.md §4/§9)
├── src/adapters/leadRepo.ts        # new: DynamoDB TransactWriteItems, GSI1/GSI2 queries — Data layer
└── src/routers/index.ts            # edit: register the leads router on AppRouter

apps/web/
└── src/routes/Leads/
    ├── LeadsList.tsx                # new: paginated, filterable list
    ├── LeadDetail.tsx               # new: status/assignee/notes/history, "not in Run {n}"
    ├── LeadCreateAction.tsx         # new: wired into the existing PropertyDetail drawer (B-03)
    └── leadFilters.state.ts         # new: URL-encoded filter state, mirrors Map/ExploreFilters.state.ts

packages/domain/
└── src/leads.ts                     # new: leadKey(), leadSignalsFrom(), isNotInCurrentRun()

packages/shared/
└── src/schemas/lead.ts              # new: Lead, LeadEvent, LeadSignals Zod schemas (browser-safe, per packages/shared's existing convention — see research.md)

infra/
└── lib/crm-data-stack.ts            # edit: add the crm-leads table construct + GSI1/GSI2 (typed construct, least-privilege grant to the API Lambda)

tests/
├── apps/api (Vitest: leadRepo transaction semantics, routers)
├── packages/domain (Vitest: leadKey, signals, staleness)
└── e2e/B-07.spec.ts                 # Phase D, Playwright against the hosted preview
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `status`/`assignee` are stored on the `LEAD` item (not purely recomputed by replaying every `EVT#{sequence}` item on each read), written only inside the same `TransactWriteItems` call that appends the triggering event | GSI1 (`assignee`) and GSI2 (`status`) — both already fixed by `metagross`'s design consult, `agent-design.md` — index a stored attribute; DynamoDB cannot build a GSI over a value a reader derives by replaying an item collection. Without a stored, queryable `status`/`assignee`, GSI1/GSI2 cannot exist at all | Full read-time replay of every `EVT#` item on every `leads.get`/`leads.list` call (ADR-04's literal wording) is technically correct for `leads.get` on a single key, but cannot serve `leads.list`'s GSI-backed "my leads"/status-board queries (contracts/leads.md) without first materializing the same value DynamoDB would need indexed anyway. Writing `status`/`assignee` only inside the event-append transaction — never independently, never via a separate mutable `version` field — keeps ADR-04's actual concern (no out-of-band write that can race or go stale) fully satisfied; the event log remains the sole source of truth and `status`/`assignee` can never diverge from it, since both are written together, atomically, every time |

This is a technical necessity following from the already-accepted GSI design, not a preference call. Recorded as an accepted deviation in `docs/architecture-constitution.md` §13, PO-approved 2026-10-24, per constitution Governance — satisfies §14's drift-handling rule (P1 drift resolved via §13 before G7, not left open).
