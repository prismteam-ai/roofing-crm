# B-09 agent-design.md — design-agent consults (read-only, Phase B)

Per CLAUDE.md (constitution XIII–XVII): design agents are consulted read-only and their answers
are recorded here *before* `/speckit-plan`. Agents consulted: `alakazam` (Opus), `ash`, `smeargle`,
`porygon` (Sonnet) — per `stories/B-09-agent-hardening.md` front matter `agents.design`. None of
these agents wrote or edited any file; this document is the orchestrating session's own compilation
of their answers, plus two corrections found while compiling (below).

## Corrections found while compiling (resolved, no new PO decision needed)

1. **Confidence-threshold wording.** The story's edge-case bullet ("confidence below 0.80 → the
   agent asks a clarifying question") is an imprecise paraphrase. The binding source is
   `docs/architecture-constitution.md` ADR-06 (PO-accepted 2026-10-23): **auto ≥ 0.92 · clarify
   0.80–0.92 (or margin < 0.05 between top two candidates) · refuse/`not_found` < 0.80**. ADR-06
   governs. alakazam's own free-text recommendation drifted from this (it suggested "proceed with
   an assumption" for 0.80–0.92, which ADR-06 says should clarify, not proceed) — alakazam's
   *quoted* ADR-06 text is correct and is what the plan uses; its own recommendation is superseded
   by the already-accepted ADR. The story's edge-case line should be corrected to match ADR-06
   during `/speckit-plan`/spec touch-up.
2. **Prototype path.** The story's "Prototype reference" table points at `design/screens/CrmAsk*`.
   That directory doesn't exist; the real files are at `design/prototype/CrmAsk*.dc.html`
   (confirmed: `CrmAsk390/768/1440.dc.html`, `CrmAskWorking390`, `CrmAskNoResults390`,
   `CrmAskLowConf390`, `CrmAskNotFound390`, `CrmAskOutside390`, `CrmAskThrottled390`,
   `CrmAskPaused390`, `CrmAskSlow390`, `CrmAskConfirm390/1440`, `CrmAskCreated390`,
   `CrmAskCreateFailed390`, `CrmAskNoAddress390`, `CrmAskNoContractor390`, `CrmAskStates`). Use
   these paths in tasks.md and the Playwright spec; correct the story's table too.

---

## 1. alakazam — retrieval design (Opus consult)

**Shape:** structured hybrid RAG, no vectors. The model only ever sees real index rows returned by
typed tools.

**Tools** (`apps/api/src/services/agent/tools.ts`, routers thinned into shared services first:
`services/search.ts`, `services/propertyDetail.ts`, reused by both the existing routers and the
new agent tools):

- `geocodePlace({text})` → `{status: resolved|ambiguous|out_of_scope, placeId, name, point, kind, confidence, candidates≤3, source}`, via a `PlaceResolver` port wrapping `packages/oracle-views/gazetteer/travis-places@1.0.0`. The model gets a `placeId`, **never raw lat/lng** — it cannot invent a center.
- `searchProperties({placeId, radiusMi 0.5–25, roofAgeMinYears?, ownerAreaClass?, tenureYearsMin?, limit≤25})` — same two-call/`counts` pattern as `routers/search.ts`; `ownerAreaClass`/`tenureYearsMin` added to `SearchPropertiesQuery` in `adapters/duckDbParquet.ts` for golden query G4.
- `searchPermits({placeId?, radiusMi?, permitNumber?, isOpen?, openDaysMin?, sort:"openDays"})` — radius → propertyCids → `leadIndex.searchPermits` + `isLongOpen`; `permitNumber?` added for G5.
- `getProperty({propertyCid})` → `propertyDetail()`.
- `proposeLeads({propertyCids≤25})` — reads only (`getProperty`, `leadSignalsFrom`, dup-check), **writes nothing**, returns `CreateLeadInput` drafts with `createdFrom:"agent"`. The UI calls `leads.create` only after rep confirmation.

Model sees ≤25 compact rows/call; UI gets full rows via `resultSetId`. Owner name never sent to the model (ADR-03).

**Confidence/citations:** `services/agent/placeResolver.ts` (Jaro-Winkler fuzzy score, −0.05 if top-2 candidates are within 0.05) feeding ADR-06's bands (see correction #1 above). `services/agent/verifyCitations.ts`: every cited CID must (a) be in this ask's own tool-result set and (b) resolve via a batch `leadIndex.getProperty` against the current `manifestCid`; every number in the answer text must equal a tool `count`. Failures strip the bad CID and fall back to a deterministic template — never a fabricated claim. `AgentAnswer` Zod shape: `{outcome, text, assumptions[], center?, thresholds, counts, results[], citations[], clarify?, resultSetId, manifestCid, traceId, modelCalls}`, `outcome ∈ {answered, no_results, invalid_scope, ambiguous_place, timed_out, rate_limited, paused}`.

**Budget:** plan (Haiku-class) → tools → ≤1 repair → compose = ≤3 model calls (hard-fail counter), `AbortSignal.timeout(23_000)` on every call.

**Golden harness:** `tests/agent/golden.json` + `tests/agent/golden.test.ts` (Vitest), calling `agent.ask` over `RUNTIME_URL` (never localhost) as a Cognito eval user. Per-query assertions: groundedness (every cited CID resolves + `manifestCid` matches the pinned Run-2 CID), correctness (re-run `search.*` with the answer's stated center/thresholds, results ⊆ that set, recall ≥80%), honesty (center/thresholds stated in text; "BBB not available" shown correctly), G6 empty-scope, G7 lead-creation round-trip. Latency: p95 < 20s, max < 23.5s. `GOLDEN_REPEATS=3` (21 asks total), paced 13s apart to stay under 5/min. Unit tests use `MockLanguageModelV2`, including one asserting a planted fake CID gets stripped.

**Risks → proof:** fabricated CID → citation gate + `AgentCitationsStripped` metric at 0. Latency (442k-row DuckDB cold load + 2–3 model calls) → warm index, Haiku planner, ≤25 rows, prompt caching; proven by golden p95 table + dashboard widget. Rate/spend cap exhaustion during eval → 3 repeats/pacing, harness log shows no `paused`/`rate_limited`. Gazetteer exact-match-only → fuzzy layer + `partial_in_travis` caveat. BBB always `not_checked` in v1 → text must say "not available," never a rating. Prompt injection via record fields → rows sent as delimited JSON data, tool set closed. Data-switch drift (AC-7) → harness pins the manifest CID constant; moving to a newer run is a one-constant change + rerun. Agent writes a lead directly → unit test asserts `proposeLeads` has no write port injected; live proof is the G7 lead showing `createdFrom:"agent"`.

## 2. ash — agent runtime design

**Files (new, native):** `apps/api/src/routers/agent.ts` (router/Zod/orchestration only), `apps/api/src/agent/getModel.ts` (`AI_PROVIDER` switch), `apps/api/src/agent/tools.ts`, `apps/api/src/agent/runAgent.ts` (tool loop + abort + guards), `apps/api/src/agent/rateLimiter.ts`, `apps/api/src/agent/spendCap.ts`, `apps/api/src/agentErrors.ts` (mirrors `leadErrors.ts`).

**Input:** `{question: string(1–500), threadId: string}`. **Output:** discriminated union so the client never guesses state — `answer | clarify | empty | proposal | lead_created | timed_out | throttled | over_budget`, each carrying `traceId`.

No `ai`/`@ai-sdk/amazon-bedrock` deps installed yet in `apps/api/package.json` — add them; Gateway path reuses the existing `~/.config/assessment/ai-gateway.env` key convention (never printed/committed). `getModel()` returns the Bedrock `eu.` inference-profile model when `AI_PROVIDER=bedrock`, or the Gateway model id when `AI_PROVIDER=gateway`; throws on anything else. `runAgent.ts` uses the SDK's own `generateText({model, tools, maxSteps:3, abortSignal})` — `maxSteps:3` directly encodes the ≤3-calls NFR, not a hand-rolled loop.

**Logging/abort:** reuse `@crm/observability`'s `createObservability("crm-api")` exactly as `leads.ts`/`search.ts` do; new metric constants `AgentAsksTotal`, `AgentToolCalls`, `AgentToolLatencyMs`, `AgentTimeouts`, `AgentThrottled`, `AgentOverBudget`. Per-tool-call log: `{procedure:"agent.ask", tool, requestId, latencyMs, argsShape: Object.keys(args)}` — never values (no question text, no address) per P0-13. 23s abort via `AbortController`/`setTimeout(23_000)`, caught and mapped to `{kind:"timed_out"}` — same pattern as `mapIndexNotReady` in `search.ts`, never rethrown as a 500.

**Rate limit + spend cap:** no existing table for this — add `crm-agent-usage` DynamoDB table (`crm-data-stack.ts`), two item shapes: `userId#windowMinute` (5/min check) and `userId#date` (atomic cents counter, $3/day cap), both enforced via conditional `UpdateItem` (same pattern B-07's `expectedSequence` conditional write uses) — in-memory counters rejected since Lambda sandboxes aren't shared. Throttled → `{kind:"throttled", retryAfterSec}` → `TRPCError TOO_MANY_REQUESTS`/`appCode:"RATE_LIMITED"` (same `withAppCode` mechanism as `ALREADY_EXISTS`). Spend cap checked *before* the model call (estimated cost), not after → `{kind:"over_budget"}`/`appCode:"OVER_BUDGET"`.

**Confirmation flow:** two turns, never a single model-authorized write. (1) Model calls `proposeLeads` (pure, no side effects) → router returns `{kind:"proposal", leads}`, nothing persisted. (2) Rep confirms via a **separate, non-model-invoked** mutation `agent.confirmLead`. (3) That mutation calls `requireLeadService(ctx).create(input, requireUserId(ctx))` — the exact same B-07 call path, `createdFrom:"agent"`. The model's tool set never includes anything that reaches `LeadService.create`; this is literally FR-002/AC-2/constitution P0's enforcement mechanism.

**Risks → proof:** fabricated CID → server-side citation check (ties to alakazam's gate). Abort racing a tool call → staging-only delay flag, confirm UI shows "took too long." Rate/spend-cap race → concurrent-request script against the hosted endpoint, expect exactly 5 successes. Confirm-flow bypass → grep `agent/tools.ts` for any `LeadService`/`requireLeadService` import (must appear only in the confirm mutation). AC-7 regression → before/after golden-query diff across the data switch.

## 3. smeargle — responsive design (AC-5) + audino's AC-8 sibling piece

**Breakpoints:** no shared `tablet.css`/`compact.css` needed — B-01/B-03 already use CSS Modules with inline `@media` queries per component (`AppShell.module.css`, `NavRail.module.css` 600px rail breakpoint, `Map.module.css`, `PropertyDetail.module.css`, `Leads.module.css`, etc.) and `playwright.config.ts`'s three `projects` (`mobile-390`/`tablet-768`/`desktop-1440`) are the one real "breakpoints config." New Ask screen follows the same convention: `apps/web/src/routes/Ask/Ask.module.css`.

**Suite:** `tests/e2e/responsive/ask.spec.ts` (new), following `map-shell.spec.ts`'s exact shape (`signIn()` helper, `document.fonts.ready`), running under the existing three Playwright projects against `baseURL=RUNTIME_URL` (never localhost — enforced by `config-guard.spec.ts`). Add `tests/e2e/responsive/leads-shell.spec.ts` if LeadDetail/LeadsList aren't already covered (today's `map-shell.spec.ts` only covers Map+AppShell). Pass criteria (reused verbatim from `map-shell.spec.ts`): no horizontal overflow (`scrollWidth<=clientWidth`), correct layout-mode CSS at the rail breakpoint, correct compact/rail control visibility swap, bounding-box containment for reachable controls, and the existing `atlasTokenAudit` token check — no new 44px tap-target rule invented unless a prototype explicitly calls for it.

**Running live:** no new CI wiring needed — `playwright.config.ts` already gates `RUNTIME_URL` (hosted) vs. local dev server (pre-deploy only), forces `workers:1` (shared live Cognito account). Runs in Phase Z against the Amplify branch preview, same as B-03's TZ03.

**Risks:** each Ask state (`working`/`answer`/`no_results`/`low_confidence`/`throttled`/`paused`) needs its own `data-state` attribute (mirrors `CrmMapIndexDown390`'s precedent — a degraded state is valid proof, not failure); confirm attribute names against the corrected `design/prototype/CrmAsk*.dc.html` files (see correction #2). Throttled/paused are rate/cost-cap-dependent and not reliably reproducible live without a test-only trigger seam — add one, or defer with a reason per AC-8's own allowance. Low-confidence/no-results need deterministic seeded queries (ambiguous place name; ZIP 99999), same pattern as existing `GEORGETOWN`/`PFLUGERVILLE` constants. Run the full responsive suite once, *after* audino's AC-8 fixes land, not before.

## 4. porygon — metrics/observability design (AC-6, part of AC-4)

**Agent metrics** (add to `packages/observability/src/index.ts` `METRIC_NAMES`, emitted from the new `apps/api/src/routers/agent.ts` via the same `obs.metrics.addMetric(...)` pattern as `leads.ts`): `AgentAsksTotal` (Count, dim `outcome`), `AgentAnswerLatencyMs` (ms, drives AC-4 p95), `AgentCitationsTotal`/`AgentCitationsVerified`/`AgentCitationGroundednessRate` (reconciles cited CIDs against the same `LeadIndex` the routers already query — not a second index, not the MCP), `AgentLeadsProposed`, `AgentModelCallsTotal` (tracks the ≤3-call NFR). No per-CID dimension (high cardinality, unsuitable for a CloudWatch dashboard).

**DLQ + alarm:** **no new construct needed** — `infra/lib/crm-sync-stack.ts`'s `addFetchPartDlqAndAlarm()` already creates `FetchPartDlq` + `FetchPartDlqAlarm` (`ApproximateNumberOfMessagesVisible > 0`, `treatMissingData: NOT_BREACHING`, self-resolves on its own once depth returns to 0 — alarms are state-based, no custom resolve logic required), and `CrmSyncStack` already accepts an `alarmEmail` prop wired to an SNS `EmailSubscription`. AC-6 work is: confirm the stack is actually instantiated with `alarmEmail: "eng.heba.gaber@gmail.com"` wherever composed (check `infra/bin/*.ts`) — if omitted today, that's the whole fix, not a new alarm.

**`RoofingCrm` dashboard:** no dashboard CDK exists yet. Add `cloudwatch.Dashboard(this, "RoofingCrmDashboard", {dashboardName:"RoofingCrm"})` to `infra/lib/crm-ops-stack.ts` (or a new `crm-dashboard-stack.ts` if ops should stay auth-only — defer to metagross/builder judgment on stack boundary). Widgets: DLQ depth (reuse `CrmSyncStack.fetchPartDlq`'s metric), `AlarmStatusWidget` for `FetchPartDlqAlarm`, `AgentAnswerLatencyMs` p95, `AgentCitationGroundednessRate` (target line 100), golden-query pass rate (see below).

**AC-4 as an ongoing, not one-time, check** — three layers sharing one definition (cited CID ∈ current index): (1) CI/golden-harness run at merge time (`tests/agent/golden.json`, per checks.md §7.2); (2) a per-request runtime metric (`AgentCitationGroundednessRate`) on every real `agent.ask` call, with its own CloudWatch alarm so citation drift pages the same SNS topic as the DLQ alarm, not just failing quietly in a nightly test; (3) the CI/scheduled harness `PutMetricData`s a `GoldenQueryPassRate` custom metric so the dashboard trends the last real run instead of only a green CI badge.

**Risks:** none named beyond "don't let the same '100%' claim drift apart across CI/runtime/dashboard" — addressed by the one-definition/three-delivery-points design above.

---

## Net effect on Phase B → `/speckit-plan`

- Builder groups stay as the story's front matter: `alakazam` (retrieval: tools, place resolver, citation gate, golden harness), `ash` (agent runtime: router, getModel/AI_PROVIDER, tool loop, rate/spend guards, confirm-flow mutation), `metagross` (responsive config + Ask UI states + CloudWatch dashboard/DLQ-alarm wiring + agent business metrics — porygon's and smeargle's pieces both land as metagross tasks per the story's builder assignment, reviewed by porygon/audino/smeargle).
- Two corrections (confidence bands → ADR-06, prototype path → `design/prototype/`) get folded into the spec/story text during `/speckit-plan`, not escalated — both are already resolved by binding, previously-accepted documents.
- `/speckit-tasks` should produce 3 task groups matching the above, each importable task-by-task into its builder subagent per CLAUDE.md's kit-agent-ownership rule.

---

## Appendix: verbatim consult answers (constitution XIV)

Sections 1–4 above are this session's compiled synthesis. Constitution XIV requires each design
agent's answer saved word for word; the unedited hand-back text each agent returned follows,
exactly as received (only the outer `[Subagent hand-back]` wrapper and the harness's own
not-user-input framing are stripped, since those are delivery metadata, not the agent's answer).

### alakazam (verbatim)

```text
## alakazam design consult: B-09 agent retrieval (read-only)

I checked this against run-log.md, story AC-1..8, ADR-06 and my earlier consult (docs/decisions/0000-agent-architecture.md §6), the routers, the LeadIndex port and the vendored gazetteer. **It is RAG of the "structured hybrid" kind with no vectors.** The model only ever sees real index rows that typed tools return.

### 1. Tools (Zod, `apps/api/src/services/agent/tools.ts`)
Move the router bodies into services first, so the routers and the tools share one code path (the thin-router rule): `services/search.ts` (from search.ts), `services/propertyDetail.ts` (from property.ts, including `bbbFor`/`lineageUrl`).

- `geocodePlace({ text: z.string().max(120) })` → `{ status: "resolved"|"ambiguous"|"out_of_scope", placeId, name, point:{lat,lon}, kind:"place"|"zcta", confidence, candidates:[≤3], source }`. A `PlaceResolver` port wraps `packages/oracle-views/gazetteer/travis-places@1.0.0` `lookup()`. The resolver stores the point under `placeId` in the per-ask context.
- `searchProperties({ placeId, radiusMi: 0.5–25, roofAgeMinYears?, ownerAreaClass?, tenureYearsMin?, limit ≤25 })` → `searchPropertiesService`. That service makes the same two `leadIndex.searchProperties` calls and `counts` as the router. **The model passes `placeId`, never lat/lng**, so it cannot invent a center. G4 needs `ownerAreaClass` and `tenureYearsMin`, added as optional fields on `SearchPropertiesQuery` in the DuckDB adapter (`apps/api/src/adapters/duckDbParquet.ts`).
- `searchPermits({ placeId?, radiusMi?, permitNumber?, isOpen?, openDaysMin?, sort:"openDays" })` → the permits service: radius → `propertyCids` → `leadIndex.searchPermits`, plus `isLongOpen`. Add `permitNumber?` to `SearchPermitsQuery` for G5. For G2's "many years", use the threshold constant from `packages/domain`. Never write a second literal.
- `getProperty({ propertyCid: CidV1 })` → `propertyDetail()`.
- `proposeLeads({ propertyCids: CidV1[] max 25 })` → for each one: `getProperty`, then `leadSignalsFrom`, then an "already a lead?" read. It returns `CreateLeadInput` drafts with `createdFrom:"agent"` and **writes nothing**. The UI calls `trpc.leads.create` after the rep confirms.

The model gets at most 25 compact rows per tool call. The UI gets full rows by `resultSetId`. Owner name is never sent (ADR-03).

### 2. Confidence and citations
**Confidence** (`services/agent/placeResolver.ts`):
- 1.0 for an exact name or ZCTA match.
- 0.95 when the LSAD word ("city", "town") is dropped or the same-named CDP is disambiguated away.
- Below that, a fuzzy score (Jaro-Winkler over gazetteer names, for typos like "Pflugervile").
- Minus 0.05 when the top two candidates are within 0.05 of each other.

**Threshold:** the story's AC says below 0.80 → clarify. ADR-06 says 0.80–0.92 → clarify and below 0.80 → refuse. **These conflict; the PO needs to choose.** I recommend:
- 0.92 or higher: proceed.
- 0.80 to 0.92: proceed, with "Assumed X (lat, lon)" plus alternatives.
- Below 0.80 with candidates: `ambiguous_place`, a clarifying question with the top 3 and no search.
- `out_of_scope` (for example ZIP 99999): `invalid_scope`.

Neither refusal path makes a compose call; the answer is a fixed template.

**Citation gate** (`services/agent/verifyCitations.ts`):
- Every cited CID must be in this ask's tool-result set, and also come back from a batch `leadIndex.getProperty` against the current `manifestCid`.
- Every number in the text must equal a tool `count`.
- On any failure, unknown CIDs are stripped and the answer falls back to a deterministic template.

**Answer shape** (`AgentAnswer`, Zod in packages/domain):
- `{ outcome, text, assumptions[], center?, thresholds, counts, results[{propertyCid, address, lat, lon, roofAgeYears, roofAgeBasis, provenance}], citations[{propertyCid, manifestCid, sourceUrl | missingReason}], clarify?, resultSetId, manifestCid, traceId, modelCalls }`.
- `outcome` is one of: `answered | no_results | invalid_scope | ambiguous_place | timed_out | rate_limited | paused`.
- When the outcome is `no_results` or `invalid_scope`, `results` is `[]` and the text names the scope that was checked, e.g. "ZIP 99999 is not a Travis County ZIP; 0 results."

**Budget:** plan (Haiku-class) → tools → at most 1 repair → compose. A wrapper counter hard-fails at 3 model calls. Put `AbortSignal.timeout(23_000)` on every call.

### 3. Golden harness
- `tests/agent/golden.json` (the path checks.md §7.1 requires) and `tests/agent/golden.test.ts` (Vitest).
- It calls `agent.ask` through `packages/api-client` on `RUNTIME_URL` (localhost is refused) with a Cognito eval user. G2 and G7 run in G1's `threadId`.

Assertions per query:
- **Groundedness (100%):** every `results[].propertyCid` returns non-null from `property.get`, and `answer.manifestCid === bafkreife3vk…pcute`.
- **Correctness:** re-run `search.properties` or `search.permits` with the center and thresholds the answer states. The returned rows must be a subset of that result, with recall ≥ 80% of the top N.
- **Honesty:** the text contains the center coordinates and thresholds. "BBB not available" appears when `bbbStatus === "not_checked"`.
- **G6:** `outcome === "invalid_scope"` and `results.length === 0`.
- **G7:** `leads.create(proposal)`, then `leads.list` contains the lead. `ALREADY_EXISTS` also passes, so reruns don't fail.
- **Latency:** time each ask on the client. Assert p95 < 20 s and the maximum < 23.5 s.

`GOLDEN_REPEATS` defaults to 3 (21 asks), paced 13 s apart to stay under 5 asks/min. Results go to `docs/evidence/B-09.md`. Unit tests use `MockLanguageModelV2` in `apps/api/src/services/agent/*.test.ts`, including one that injects a made-up CID and expects it to be stripped.

### 4. Risks → mitigation → how to prove it live
1. **The model makes up a CID or a number** → the citation gate plus the template fallback. Proof: the golden groundedness check, and the CloudWatch metric `AgentCitationsStripped` staying at 0.
2. **p95 latency** (a DuckDB cold load of about 442k rows plus 2–3 model calls) → keep the index warm, plan with Haiku, compose from at most 25 rows, use prompt caching. Proof: the golden p95 table, plus the `AgentLatencyMs` p95 widget on the RoofingCrm dashboard.
3. **The eval run hits the $3/day cap or the 5/min limit** (ARD §239 says ×20, which is about 140 asks) → 3 repeats and pacing. Proof: the harness log shows no `paused` or `rate_limited`.
4. **The confidence-band conflict** (ADR-06 vs the story) → the PO decides before `/speckit-plan`. Proof: run "Pflugervile" and an ambiguous name on the hosted Ask screen.
5. **The gazetteer only does exact matches** → the fuzzy layer, plus a `partial_in_travis` caveat in `assumptions`.
6. **BBB is always `not_checked` in v1** → the text must say "not available" and must never show a rating. Proof: G2/G5 text assertions.
7. **Prompt injection through record fields** → rows go to the model as delimited JSON data, and the tool set is closed.
8. **Data-switch drift** (AC-7) → the harness pins the manifest CID. When pointing at a newer run, update one constant and rerun the harness.
9. **The agent writes a lead** → `proposeLeads` has no write port injected (a unit test asserts this). Proof: the G7 lead shows `createdFrom: "agent"` and was created through `leads.create`.
```

> Orchestrating-session note on alakazam's point 4 ("These conflict; the PO needs to choose"):
> ADR-06 is already PO-accepted (2026-10-23, recorded in `docs/architecture-constitution.md`,
> binding per CLAUDE.md once G3 approves it — G3 has approved). A binding, already-accepted ADR is
> not reopened by a design consult's restatement of it; it governs over the story's looser
> paraphrase and over alakazam's own free-text recommendation in the same answer (which drifted
> from the ADR it had just quoted). See "Corrections found while compiling," item 1. No new PO
> decision is needed; this is applying an existing one correctly.

### ash (verbatim)

```text
## 1. `agent.ask` procedure shape

File layout (new, native — no A-14 files to copy):
- `apps/api/src/routers/agent.ts` — the router, input/output Zod, orchestration glue only.
- `apps/api/src/agent/getModel.ts` — `AI_PROVIDER` switch.
- `apps/api/src/agent/tools.ts` — Zod tool defs (`geocodePlace`, `searchProperties`, `searchPermits`, `getProperty`, `proposeLeads`, `createLead`).
- `apps/api/src/agent/runAgent.ts` — the tool loop + abort + spend/rate guards.
- `apps/api/src/agent/rateLimiter.ts`, `apps/api/src/agent/spendCap.ts` — NFR enforcement.
- `apps/api/src/agentErrors.ts` — typed errors, mirroring `leadErrors.ts`.

Input Zod (added to `appRouter` in `routers/index.ts` as `agent: agentRouter`):
```ts
const AskInput = z.object({
  question: z.string().trim().min(1).max(500),
  threadId: z.string().min(1), // client-generated conversation id, for multi-turn confirm flow
});
```
Output is a discriminated union so the client never has to guess state:
```ts
type AskOutput =
  | { kind: "answer"; text: string; citations: { propertyCid: string }[]; centerUsed?: {lat:number;lon:number;label:string}; traceId: string }
  | { kind: "clarify"; question: string; traceId: string }           // confidence < 0.80
  | { kind: "empty"; reason: string; traceId: string }               // AC-3
  | { kind: "proposal"; leads: ProposedLead[]; traceId: string }     // after proposeLeads
  | { kind: "lead_created"; leadKey: string; traceId: string }       // after confirmed createLead
  | { kind: "timed_out"; traceId: string }                           // 23s abort, never a 500
  | { kind: "throttled"; retryAfterSec: number; traceId: string }
  | { kind: "over_budget"; traceId: string };
```
No package installed yet for `ai`/`@ai-sdk/amazon-bedrock` — `apps/api/package.json` currently has no AI SDK deps. Add `ai`, `@ai-sdk/amazon-bedrock` (Bedrock path), and reuse the existing `AI_GATEWAY` key convention from `~/.config/assessment/ai-gateway.env` for the gateway path (never printed/committed, loaded by env var at runtime only).

`getModel.ts`:
```ts
export function getModel() {
  const provider = process.env.AI_PROVIDER; // "bedrock" | "gateway"
  if (provider === "bedrock") {
    return bedrock("eu.anthropic.claude-sonnet-4-5-20250929-v1:0"); // eu. inference profile, eu-north-1 region client
  }
  if (provider === "gateway") {
    return gateway("anthropic/claude-sonnet-4.6"); // Vercel AI Gateway model id
  }
  throw new Error(`Unknown AI_PROVIDER: ${provider}`);
}
```
`runAgent.ts` uses `generateText({ model, tools, maxSteps: 3, ... })` (the SDK's own tool-loop, not hand-rolled) — `maxSteps: 3` directly encodes the ≤3-model-calls NFR.

## 2. Tool-loop logging + 23s abort

Every tool wraps the same `observed()` pattern already in `leads.ts`/`search.ts`, reusing `@crm/observability`'s `createObservability("crm-api")`. Add metric constants to `packages/observability/src/index.ts`: `AgentAsksTotal`, `AgentToolCalls`, `AgentToolLatencyMs`, `AgentTimeouts`, `AgentThrottled`, `AgentOverBudget`. Log shape per tool call: `{ procedure: "agent.ask", tool: toolName, requestId, latencyMs, argsShape: Object.keys(args) }` — never the args' values (no address text, no question text verbatim) per P0-13, matching `leads.ts`'s comment convention exactly.

23s abort: `AbortController` created in the `agent.ts` mutation, `setTimeout(() => controller.abort(), 23_000)`, passed as `abortSignal` into `generateText`. Catch block checks `error.name === "AbortError"` and returns `{ kind: "timed_out", traceId }` — never rethrown, never an unhandled 500, same shape as `mapIndexNotReady` in `search.ts`.

## 3. Rate limit + spend cap

No existing rate-limit/throttle table in `infra/lib` — none of `crm-api-stack.ts`/`crm-data-stack.ts` has one yet. Add a small DynamoDB table (`crm-agent-usage`, PK `userId#windowMinute` for the 5/min check, separate item `userId#date` with an atomic `ADD` counter in cents for the $3/day cap), provisioned in `crm-data-stack.ts` alongside the existing `crm-leads` table, read/write-granted to the API Lambda in `crm-api-stack.ts`. Enforce with `UpdateItem` + conditional expression (`attribute_not_exists OR count < :limit`) so it's atomic under concurrent asks — same DynamoDB-conditional-write pattern B-07's lead service already uses for `expectedSequence`. In-memory counters are rejected per architecture-constitution (Lambda sandboxes aren't shared, so "5/min/user" would be unenforceable across concurrent invocations).

Throttled response: `{ kind: "throttled", retryAfterSec, traceId }`, mapped to a `TRPCError({ code: "TOO_MANY_REQUESTS" })` at the tRPC boundary with `appCode: "RATE_LIMITED"` via `withAppCode` (same mechanism as `ALREADY_EXISTS`/`STALE_SEQUENCE` in `trpc.ts`). `CrmAskThrottled390.html` implies a banner state with a retry countdown — the `retryAfterSec` field is what drives it. Spend cap hit → `{ kind: "over_budget" }` → `appCode: "OVER_BUDGET"`, checked *before* calling the model (estimate cost from token budget, not after the call completes).

## 4. createLead confirmation flow

Two-turn mechanic, never a single model-authorized write:
1. Turn 1: model calls `proposeLeads` (a pure, no-side-effect Zod tool) which returns candidate leads built only from already-cited `property_cid`s in the current answer. The router returns `{ kind: "proposal", leads }` — nothing is persisted.
2. Client renders `CrmAskConfirm1440.html`-style confirmation; rep clicks confirm, which calls `agent.confirmLead` (a **separate, non-model-invoked** tRPC mutation) with the `leadKey`/`propertyCid` from the proposal plus `threadId`.
3. `agent.confirmLead` calls `requireLeadService(ctx).create(input, requireUserId(ctx))` — the exact same B-07 `leads.create` application-layer call `leads.ts` already uses, with `createdFrom: "agent"` (the enum already has this value in `CreateLeadInput`). The model is never given a `createLead` tool that writes; `createLead` as named in the story's "Zod tools" list is implemented as the *proposal* tool (`proposeLeads`) plus this confirm-mutation pair — the model has no code path that reaches `LeadService.create` directly. This is the literal mechanism behind FR-002/AC-2/constitution P0.

## 5. Named risks and live proof

- **Model fabricates a `property_cid`** → every citation is checked server-side against `leadIndex.getProperty(cid)` before being included in the answer; AC-4's "100% citation groundedness" is the golden-query harness asserting this post-hoc against the hosted endpoint.
- **23s abort races a tool call mid-flight** → prove by a golden query against a throttled/slow Bedrock profile or by injecting an artificial delay in a staging-only flag; confirm the UI shows "took too long," not a spinner or 500, on the hosted URL.
- **Rate limit/spend cap race under concurrent asks** → prove with a small concurrent-request script against the hosted `agent.ask` endpoint; DynamoDB conditional write should produce exactly 5 successes and N throttles, never 6+.
- **Confirm-flow bypass (model infers a direct write)** → prove by code inspection: grep the `agent/tools.ts` file for any import of `LeadService`/`requireLeadService` — it must appear only in `agentRouter`'s `confirmLead` handler, never inside a tool executed by `generateText`.
- **AC-7 data-switch regression** — prove the switch from the 35-row sample to the Run 2 manifest with the same golden queries before/after, and record the differences.
```

### smeargle (verbatim)

```text
Design answer for specs/009-agent-hardening/agent-design.md (smeargle, AC-5 + AC-8 sibling):

**1. Breakpoints config**
B-01/B-03 already built the real responsive baseline natively — there is no missing tablet.css/compact.css to add, because the pattern here is CSS Modules + a single numeric breakpoint per component, not a shared stylesheet pair. Found: `AppShell.module.css`, `NavRail.module.css`, `MoreSheet.module.css` (600px rail breakpoint, previously inconsistent — fixed per CR-B-01), `Map.module.css`, `FilterSheet.tsx`, `ResultsPanel.tsx`, `PropertyDetail.module.css`, `ResultRow.module.css`, `Leads.module.css`, `TopBar.tsx`. These use plain `@media` queries inline per module, not container queries, and that's fine — B-09 should follow the same convention, not introduce a new mechanism. There is one canonical viewport source already: `playwright.config.ts`'s three `projects` (`mobile-390`/`tablet-768`/`desktop-1440`), which is effectively the shared "breakpoints config" smeargle needs — reuse it, don't duplicate it. Add the new Ask screen's own CSS module (`apps/web/src/routes/Ask/Ask.module.css`) following the existing 600px rail-breakpoint convention and the Map/Leads modules' precedent; no new `tablet.css`/`compact.css` files are needed or should be created.

**2. Playwright suite design**
Lane: `tests/e2e/responsive/` (existing pattern — `map-shell.spec.ts`, `sign-in.spec.ts`, `coming-soon.spec.ts`), running under the root `playwright.config.ts`'s three projects (390/768/1440), against `baseURL` from `RUNTIME_URL` (never localhost in Phase Z — enforced by `assertHostedRuntimeUrl` + `config-guard.spec.ts`). Add one new file, `tests/e2e/responsive/ask.spec.ts`, following `map-shell.spec.ts`'s exact shape: `signIn()` helper, `beforeEach` → sign in + `document.fonts.ready`, then per-test checks. The "enumerate every `ui:true` screen" requirement is satisfied by one spec file per existing ui:true story (sign-in, map-shell/AppShell+NavRail, coming-soon, Leads/LeadDetail — add `tests/e2e/responsive/leads-shell.spec.ts` if not already covering LeadDetail/LeadsList, since map-shell.spec.ts only covers Map+AppShell) plus the new `ask.spec.ts`. Screens to cover: CrmMap, FilterSheet, PropertyDetail, ContractorBadge, ResultsPanel, LeadsList, LeadDetail, AppShell/NavRail (existing, re-verify), plus Ask (working/answer/no-results/low-confidence/throttled/paused/confirm — new). Pass criteria, reusing `map-shell.spec.ts`'s exact assertions: (a) `scrollWidth <= clientWidth` (no horizontal overflow) on `document.documentElement`; (b) layout-mode CSS assertion (`toHaveCSS('flex-direction', ...)`) at the rail/compact breakpoint; (c) visibility swap assertion (compact-only control visible, rail-only control hidden, or vice versa) via `toBeVisible()`/`toBeHidden()`; (d) bounding-box containment (`box.x >= 0`, `box.x + box.width <= viewport.width + 1`) for any row/control that must stay reachable without scroll; (e) the existing Atlas token audit (`atlasTokenAudit` from `tests/e2e/lib/atlas-tokens.ts`) — reuse this directly rather than inventing a new a11y bar; this repo has no separate 44px tap-target assertion today, so don't add one unless a design/screens prototype calls it out explicitly (if you want it added, say so and I'll scope it in a follow-up).

**3. Running against the hosted URL**
No separate smeargle CI wiring exists yet to extend — `playwright.config.ts` already gates this correctly: `RUNTIME_URL` unset → local dev server (pre-deploy only, explicitly exempted); `RUNTIME_URL` set → validated hosted URL, `workers: 1` (forced sequential — shared live Cognito account, found the hard way in `B-03-map-search.spec.ts`/this config's comments: don't re-break that by adding parallel seeding in the new Ask spec). Phase Z (per run-log) is where `ask.spec.ts` and the leads-shell addition actually run, with `RUNTIME_URL` pointed at the Amplify branch preview/`crm.aldarraj.com`, same as B-03's TZ03.

**4. Named risks**
- Ask's six states (working/answer-with-citations/no-results/low-confidence/throttled/paused) each need their own `data-state` attribute to assert against, mirroring `CrmMapIndexDown390`'s precedent in `B-03-map-search.spec.ts` (that file already treats an honest degraded state as valid proof, not a failure) — confirm each `CrmAsk*` prototype's `data-state` name against `design/prototype/CrmAsk*.dc.html` before writing selectors, since prototypes live at `design/prototype/*.dc.html`, not `design/screens/` (that directory doesn't exist in this repo — the story's own prototype-reference table path is stale; use `design/prototype/CrmAskWorking390.dc.html`, `CrmAskNoResults390.dc.html`, `CrmAskLowConf390.dc.html`, `CrmAskThrottled390.dc.html`, `CrmAskPaused390.dc.html`, `CrmAskConfirm390/1440.dc.html` — flag this path correction in the story/spec).
- Throttled and paused states are rate/cost-limit dependent (NFR-001: 5 asks/min/user, $3/day cap) — not reliably reproducible live without a seam; add a test-only trigger (e.g. a header or seeded flag) rather than actually exhausting the real rate limit in CI, or mark these two states as visually asserted via a forced `data-state` override if the agent runtime exposes one — otherwise defer with a reason per AC-8's own allowance.
- Low-confidence (place-resolution < 0.80) and no-results both need a deterministic query (e.g. ZIP 99999 for AC-3, an ambiguous place name for low-confidence) seeded in the spec, same pattern as `GEORGETOWN`/`PFLUGERVILLE` constants in `B-03-map-search.spec.ts`.
- AC-8's re-diff (audino's sibling piece) should land its fixes in the same CSS modules smeargle already asserts against, so re-run the full `responsive/` suite once after audino's fixes, not before, to avoid proving a stale layout.
```

### porygon (verbatim)

```text
Design answer for `specs/009-agent-hardening/agent-design.md` (porygon, read-only consult on B-09/B-11):

## 1. Agent business metrics

Add to `packages/observability/src/index.ts`'s `METRIC_NAMES` (same const-object pattern leads.ts uses — never an inline string literal at a call site):

```
AgentAsksTotal: "AgentAsksTotal",             // Count, dim: outcome=answered|no_results|low_confidence|throttled|error
AgentAnswerLatencyMs: "AgentAnswerLatencyMs",  // Milliseconds — first-useful-answer latency, drives AC-4's p95
AgentCitationsTotal: "AgentCitationsTotal",    // Count — every property_cid cited, across all answers
AgentCitationsVerified: "AgentCitationsVerified", // Count — cited cids confirmed present in the current index
AgentCitationGroundednessRate: "AgentCitationGroundednessRate", // Percent (0-100), = Verified/Total per request
AgentLeadsProposed: "AgentLeadsProposed",      // Count — proposeLeads tool calls, createdFrom="agent"
AgentModelCallsTotal: "AgentModelCallsTotal",  // Count — tracks NFR-001's ≤3-calls-per-ask budget
```

Dimensions: `procedure="agent.ask"`, `outcome`, and (for citation metrics) no per-cid dimension — cid is high-cardinality, matches the skill's dashboard stop-condition ("requested dimensions are high-cardinality or unsuitable for CloudWatch dashboards"). Emit via the same `observed()`-style wrapper `apps/api/src/routers/leads.ts` uses (`obs.metrics.addMetric(METRIC_NAMES.X, MetricUnit.Count, 1)`, flushed in `finally` via `publishStoredMetrics`), inside a new `apps/api/src/routers/agent.ts`.

**Reconciliation (the unify-metrics point):** per-request, compute `citedCids.length` (AgentCitationsTotal) vs. `citedCids.filter(existsInIndex).length` (AgentCitationsVerified) by checking each cid against the same `LeadIndex`/DuckDB-Parquet index `apps/api/src/leadIndex.ts` already queries for `searchProperties`/`getProperty` — not a second index, not the MCP. `AgentCitationGroundednessRate = Verified/Total` lets you watch index-vs-answer agreement continuously rather than trust AC-4's one-time test run. If verified count were ever to disagree with golden-query "100% exist in index" assertions, that's a real drift signal, not noise — same-named counts (test-time citation count vs. production citation count) are not assumed equivalent until both resolve against the same index snapshot.

## 2. DLQ + alarm

**No new DLQ is needed.** `infra/lib/crm-sync-stack.ts` already has exactly this construct: `addFetchPartDlqAndAlarm()` (lines 73–111) creates `FetchPartDlq` (SQS, 14-day retention) and `FetchPartDlqAlarm` — `ApproximateNumberOfMessagesVisible > 0` for 1 period, `treatMissingData: NOT_BREACHING`, which self-resolves to OK the moment SQS reports depth 0 again (no custom logic needed — alarms are state-based). `CrmSyncStack`'s constructor already wires an optional `alarmTopic` (SNS) from `props.alarmEmail`, subscribing `EmailSubscription(props.alarmEmail)`.

AC-6 work is therefore: confirm `CrmSyncStack` is instantiated with `alarmEmail: "eng.heba.gaber@gmail.com"` wherever the stack is composed (check `infra/bin/*.ts` or wherever `CrmSyncStackProps` is constructed) — if it's currently omitted/undefined in the deployed app entrypoint, that's the one-line fix, not a new construct. Verify live with a forced DLQ send (sync-job failure path) and watch the alarm transition ALARM→OK in CloudWatch.

## 3. `RoofingCrm` dashboard

No dashboard CDK exists yet (`crm-ops-stack.ts` only has Cognito/lockout; `crm-sync-stack.ts` has no `cloudwatch.Dashboard`). Add it to `infra/lib/crm-ops-stack.ts` (it's already the stack that owns cross-cutting operational concerns) as a new `cloudwatch.Dashboard(this, "RoofingCrmDashboard", { dashboardName: "RoofingCrm" })`, or a new small `infra/lib/crm-dashboard-stack.ts` if ops is meant to stay auth-only — porygon has no strong opinion, defer to metagross/the existing stack-boundary convention.

Widgets, each sourced from the metrics/alarm above (no new metric plumbing beyond §1):
- `GraphWidget`: DLQ depth — `fetchPartDlq.metricApproximateNumberOfMessagesVisible()` (reuse the queue reference `CrmSyncStack.fetchPartDlq` already exports publicly).
- `AlarmStatusWidget`: `FetchPartDlqAlarm`.
- `GraphWidget`: `AgentAnswerLatencyMs` p95, namespace `RoofingCrm`, dim `procedure=agent.ask`.
- `GraphWidget`: `AgentCitationGroundednessRate` (target line at 100).
- `SingleValueWidget` or `GraphWidget`: golden-query pass rate — this isn't a live Lambda metric; see §4 for how it gets published as one.

## 4. AC-4's "100% cited cids exist" — ongoing, not just a test assertion

Three layers, so it's provable continuously, not only at merge time:
1. **Unit/CI layer (exists today, per `checks.md` §7.2):** `tests/agent/golden.json` + a Vitest harness run against the **deployed** agent endpoint in CI — one-time-per-run proof, good for gating merges.
2. **Runtime layer (new, this is the metrics-unification piece):** every live `agent.ask` call emits `AgentCitationGroundednessRate` per request (§1) — this is the same check G1–G7 make, but running on every real question asked, not just the 7 golden ones, at production scale. Wire a CloudWatch alarm on this metric too (e.g. `AgentCitationGroundednessRate < 100` for N periods → SNS, same topic as the DLQ alarm) so citation drift pages the same way DLQ depth does, rather than only failing quietly in a nightly test.
3. **Golden-query pass rate as a metric:** have the CI harness (or a small scheduled Lambda re-running it) `PutMetricData` a `GoldenQueryPassRate` custom metric (namespace `RoofingCrm`) after each run, so the dashboard's "golden-query pass rate" widget (§3) reflects the last real run rather than a green-checkmark-only CI badge with no visible trend.

This closes the loop porygon's skill requires: the same underlying fact (cited cid ∈ index) is checked at merge time (CI), at request time (production metric), and trended on the dashboard (alarm + widget) — one canonical definition, three delivery points, not three independent "100%" claims that could silently drift apart.

Files referenced: `packages/observability/src/index.ts`, `apps/api/src/routers/leads.ts` (pattern to copy into new `apps/api/src/routers/agent.ts`), `infra/lib/crm-sync-stack.ts` (existing DLQ/alarm/SNS wiring, `addFetchPartDlqAndAlarm`, `CrmSyncStackProps.alarmEmail`), `infra/lib/crm-ops-stack.ts` (proposed dashboard home), `../assessment-guide/reference/checks.md` §7 (golden-query harness contract, `tests/agent/golden.json`).
```
