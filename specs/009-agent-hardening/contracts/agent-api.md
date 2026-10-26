# tRPC contract: `agent` router

All procedures sit behind the Cognito JWT authorizer (constitution §12 P0-11), same as `leads`/`search`.
Zod shapes for `QueryPlan`/`AgentAnswer` are ADR-06 (`docs/decisions/0000-agent-architecture.md` §4);
this contract only adds the tRPC-boundary shapes and behavior, per `agent-design.md`.

## `agent.ask`

**Input**
```ts
{
  question: string;          // 1-500 chars, trimmed
  threadId: string;          // client-generated, identifies the conversation for ConversationEventStore
}
```

**Behavior**:
1. Budget check first, before any model call: `crm-agent-usage` conditional `UpdateItem` for the
   per-minute window and the $3/day estimated-cost cap. Over either → return a typed answer
   without calling the model (see **Errors**).
2. Load the thread's last `QueryPlan` (`threadStore.lastPlan`, the `THREAD#{threadId}` item in
   `crm-agent-usage`, owner-checked and Zod-validated), if any. A read failure only loses the
   inheritance.
3. Plan step (model call 1, plus at most one repair call on invalid JSON / Zod failure; still
   invalid → `needs_clarification`). The previous plan is shown to the model as `PREVIOUS_PLAN`
   data. **Inheritance (ADR-06 §6.3, G2):** the model marks which slots a follow-up keeps
   (`slotSources[slot] = "inherited"`, `area` for the area); the server copies those slots' values
   from the previous plan (a mis-copied value never survives). A slot marked `inherited` that the
   previous plan never had is dropped with its value; a place area with no name inherits the
   previous area.
4. Scope gate, by intent and area kind (no model call; only an in-scope area reaches a search):
   - `coverage` → no area needed; answered from the promoted run's `index_meta`.
   - `lookup_property` → `area.query` is the TCAD id; looked up directly (no place resolution).
     Not in the run → `not_found`.
   - `lookup_permit` → `filters.permitNumber` (or `area.query`) searched county-wide through the
     same radius-join path as `search.permits` (SC-06). No match → `not_found`.
   - `find_properties` / `find_permits` / `propose_leads` by `area.kind`: `place` → place
     resolution with ADR-06's bands (exact/alias = 1.0 auto-accepts; fuzzy ≥ 0.92 with margin ≥
     0.05 auto; 0.80–0.92 or margin < 0.05 → `needs_clarification` with `candidates`; < 0.80 →
     `not_found`; a ZIP-shaped non-Travis code → `out_of_scope`); `zip` → must be a Travis ZCTA,
     else `out_of_scope`; `point` (`"lat, lon"`) → must be inside Travis County's bounding box,
     else `out_of_scope`; `county` → must name Travis County, else `out_of_scope` (a county-wide
     search is the circle enclosing the county box, so it returns every indexed row with
     coordinates). An in-scope place/ZIP/point is written back to `plan.area.resolved` with the
     gazetteer source and sha256.
   - Only unsupported constraints (no stated or inherited filter) → `field_not_published`, with
     `missing[]` naming each one.
   `out_of_scope` / `not_found` / `needs_clarification` / `field_not_published` make no compose
   call; the scope-gate ones make no search either.
5. Deterministic dispatch by `plan.intent` (`searchProperties` / `searchPermits` / `getProperty` /
   `getCoverage` / `proposeLeads`) via the `LeadIndex` port over the pinned manifest CID (AC-7).
   No rows → `empty_in_scope`, no compose call.
6. Compose step (the last model call): ≤ 25 compact rows, each with a server-assigned
   `citationId`, plus the server-computed counts. Source text (contractor, jurisdiction) is
   control-stripped and capped at 120 chars. Coverage questions are worded by template, no compose.
7. Server verification (no model call):
   - A citation label resolves by the most specific id the model gave: a `permitCid` in this
     turn's permit rows, then a `propertyCid` in its property rows, else the DATA `citationId`. A
     label naming a CID no row has is planted and resolves to nothing.
   - Every resolved citation is re-checked in the live index under this turn's manifest:
     properties by `getProperty`, permits as a permit on that property, runs by `manifestCid`.
   - **Claim text** (`services/agent/claimText.ts`): every number in a claim must equal a value in
     its cited rows (roof age, open days/years, coordinates, date parts, run counts) or a
     server-computed count / plan value (radius, thresholds, centre), allowing sign, thousands
     separators, rounding to the written precision, and the floor of a fraction. Any TCAD id,
     permit number or CID it names must be a cited row's. Numbers written as words are not
     checked.
   - A failing claim is dropped. If no claim survives (or compose output did not parse) and rows
     matched, a deterministic template answer states the counts and cites the top 3 rows —
     `answered`, never `empty_in_scope`.
8. Record the turn (`threadStore.recordTurn`: plan + proposed tcadIds); emit metrics
   (`AgentAsksTotal`, `AgentAnswerLatencyMs`, `AgentModelCallsTotal`, `AgentCitationsTotal`,
   `AgentCitationsVerified`, `AgentCitationGroundednessRate`, `AgentLeadsProposed`).
   `AgentCitationsTotal` counts **every** citation label the model produced (planted ones
   included); `AgentCitationsVerified` only those that resolved, passed the index check and back a
   kept claim. Template citations are server-made and count in neither.
9. 23s `AbortSignal` wraps the whole turn; on abort, return `{outcome: "timed_out"}`, never an
   unhandled 500.

**Output**: `AgentAnswer` (ADR-06 §4 shape) — `outcome`, `claims[]`, `citations[]`, `plan`,
`resultSetId`, `counts`, `missing[]`, `proposals[]?`, `trace`, plus these additive optional
fields:

| Field | When | Shape |
| --- | --- | --- |
| `candidates` | `needs_clarification` only (empty when the area had no name) | `{name, score, match}[]`, best first, ≤ 3 |
| `missing[].count` | a row-level reason | how many evidence rows carried that `field` + `reason` |
| `citations[].lat`, `citations[].lon` | the cited row has coordinates | the cited property's point; a permit citation takes its property's point. Server-built from the dispatch rows, never from model text. Absent when the row has no coordinates |
| `citations[].nearPlace` | with `lat`/`lon` | `{name, distanceMi}`: the nearest gazetteer place (`nearestPlace` in `placeResolver.ts`), so the UI can print "near Pflugerville" |
| `rows` | at least one match row (absent for empty, refused and coverage answers) | up to 25 `AnswerRow`, the same rows the compose step saw, in dispatch order; see below |
| `retryAfterSec` | `rate_limited` | whole seconds until the next window |
| `resetsAt` | `paused` | ISO time the daily cap resets |

`AnswerRow` (`@crm/shared`): `{propertyCid, tcadId, lat?, lon?, nearPlace?, citationId?, roofAgeYears?,
roofAgeBasis?, permit?: {permitCid, number, statusClass, openDays?}, contractorResolution?, missing[]}`.
One row per property match, or per permit for permit intents and property lookups (the permit's
own property supplies `tcadId`, point and roof age). `citationId` is the number of the citation in
this answer that points at the row (permit rows by `permitCid`, property rows by `propertyCid`);
absent when no claim or template citation cites it. A row with no coordinates has no `lat`/`lon`
and carries `{field: "coordinates", reason: "no_coordinates"}` in its `missing`. `contractorResolution`
is control-stripped and capped at 120 chars. `answerPins(answer)` returns one `{n, propertyCid, lat,
lon}` per property citation with coordinates, `n` being the citation id; permit and run citations
are not pins. All of these fields are optional, so an older answer without them still validates.

`counts` come from whichever dispatch ran: property search → `matched` = rows after every filter,
`excludedNoRoofDate` = in-radius rows a roof-age filter excluded for having no roof date,
`excludedNoCoordinates` = index rows without coordinates (county-wide searches only — a radius
search cannot place them, so it adds `missing[]` `{field: "coordinates", reason:
"no_coordinates"}` instead of a number); permit search → `matched` = permits after status /
open-years filters; property lookup → 1; coverage → zeros. `shown` ≤ 25, `truncated` = matched >
shown. `missing[]` = `plan.unsupported` (`{field: constraint, reason}`) + the count-level
exclusions + every evidence row's own `missingReasons` (`@crm/oracle-contract` `MISSING_REASONS`).

**Errors**: rate and spend caps are **not** errors: over the per-minute limit `agent.ask`
returns `outcome: "rate_limited"` with `retryAfterSec`, over the daily cap `outcome: "paused"`
with `resetsAt` (no model call either way). An unconfigured usage guard → `TRPCError
INTERNAL_SERVER_ERROR`, `appCode: "AGENT_GUARD_NOT_CONFIGURED"` (fails closed). Index not ready →
the same `mapIndexNotReady` → `SERVICE_UNAVAILABLE` pattern as `search.ts`/`property.ts`.

## `agent.confirmLead`

**Input**
```ts
{
  threadId: string;
  tcadId: string;             // from a proposal in a prior AgentAnswer.proposals[]
}
```

**Behavior**: **Not model-invoked** — this is a plain tRPC mutation the UI calls after the rep taps
"Create" on the confirmation card (ADR §6.2 G7). Calls
`requireLeadService(ctx).create(input, requireUserId(ctx))` — the exact same application-layer
call `leads.create` already uses, with `createdFrom: "agent"` and `sourceManifestCid` set to the
pinned Run-2 CID. This is the whole mechanism behind FR-002/AC-2/constitution P0: the model's tool
set (`proposeLeads`) never includes anything that reaches `LeadService.create` — only this
separate, rep-triggered mutation does. A grep of `apps/api/src/services/agent/tools.ts` for any
`LeadService`/`requireLeadService` import must come back empty; it is only ever imported by this
router handler.

**Output**: `Lead` (same shape `leads.create` returns).

**Errors**: `ALREADY_EXISTS` (the property is already a lead) is a valid outcome, not a failure —
same mapping as `leads.create`.

## Tools exposed to the model (not tRPC procedures; invoked inside `agent.ask`'s tool loop)

Per ADR-06 §6.2, unchanged this round except data source (AC-7):

| Tool | Input | Returns to model | Writes? |
| --- | --- | --- | --- |
| `resolvePlace` | `{text}` | name, point, match kind, score, top 3 | no |
| `searchProperties` | `QueryPlan.area` + `filters` | counts, excluded counts, ≤25 compact rows | no |
| `searchPermits` | the same + `statusClass`, `openYearsMin` | the same, sorted by `open_days` desc | no |
| `getProperty` | `{tcadId}` or `{propertyCid}` | one property + its permits, compact | no |
| `getCoverage` | `{}` | `index_meta`: run, `as_of`, limitations, counts | no |
| `proposeLeads` | `{tcadIds[] (≤25)}` | which are already leads | **no — never writes** |

`oracleCoverage` (MCP-backed, A-14-gated) is **not built this round** — the config
flag stays off; `getCoverage` reads the same index-metadata fields from Task A's published manifest,
read directly by CID.
