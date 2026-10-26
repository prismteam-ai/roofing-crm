# Phase 1 data model: B-09 agent + hardening

Primary schemas are already specified in `docs/decisions/0000-agent-architecture.md` §4/§6.2/§7
(ADR-06, accepted). This file states where each lands in code, the two corrections from
`agent-design.md`, and the new entities this round adds (AC-6/AC-7 dashboard + data-switch, which
the ADR didn't need to cover).

## QueryPlan (existing ADR shape, `packages/shared/src/agent/queryPlan.ts`)

As specified in ADR §4: `area` (place or ZIP + radius 0.5–25mi), `filters` (roof age, permit
status/open-years, owner tenure/area-class, permit number), `slotSources` (stated/default/inherited
per field, drives assumption chips), `unsupported[]` (constraint + reason). One `QueryPlan` shape
services both `search.properties`/`search.permits` and the agent (ADR pattern #2, G8 test: both
paths return identical `property_cid` sets for the same plan).

## AgentAnswer (existing ADR shape, `packages/shared/src/agent/answer.ts`)

As specified in ADR §4, used verbatim — **not** the shorter outcome enum either fresh design
consult sketched (see `agent-design.md` correction #1):

- `outcome`: `answered | empty_in_scope | out_of_scope | not_found | needs_clarification | field_not_published | timed_out | rate_limited | paused`
- `claims[]`: `{text, citationIds[]}` — every claim must have ≥1 citation id
- `citations[]`: `{id, kind, tcadId?, propertyCid?, permitCid?, sourceUrl, capturedAt, tableCid, manifestCid, asOf}`
- `plan`: the `QueryPlan` used ("How I read this")
- `resultSetId`: UI pages full rows (≤1,000) from here, never from model text
- `counts`: `{matched, shown, excludedNoCoordinates, excludedNoRoofDate, truncated}`
- `missing[]`: `{field, reason}`
- `proposals[]?`: `{tcadId, alreadyLead, leadId?}` — from `proposeLeads`, never a write
- `trace`: `{traceId, modelId, promptVersion, rankVersion, toolSteps, modelCalls}`

**Validation rules**: every `citationIds` entry must resolve against this turn's own tool-call
results (server-side verifier, ADR §4/§5) — a claim whose citation doesn't resolve is dropped
before the answer is returned, never shown unverified. `counts` fields are always server-computed,
never copied from model text.

**Correction applied here** (`agent-design.md` #1): confidence bands for place resolution are
ADR-06's three bands — auto ≥0.92, clarify 0.80–0.92 or margin<0.05, refuse (`not_found`) <0.80 —
not the simpler "<0.80 → clarify" wording in the story's edge-case bullet. `stories/B-09-agent-hardening.md`'s
edge-case line is corrected to read: "A place-resolution score below 0.80 → `not_found` (refuse,
offer to rephrase); a score of 0.80–0.92, or two candidates within 0.05 of each other → `needs_clarification`
(ask, with the top 3 as options)."

## Place resolution (existing ADR shape)

`PlaceResolver` port (`packages/shared/src/rag/ports.ts`), one adapter wrapping
`packages/oracle-views/gazetteer/travis-places@1.0.0`. Confidence bands and the
normalise→exact-alias→fuzzy→filter→rank pipeline order are ADR §5/§10 pattern #3, unchanged.
`thresholds.ts` (ADR §5 footnote, pattern #4) holds the versioned band values.

## New this round: agent usage / rate+spend guard (`crm-agent-usage` DynamoDB table)

Not in the ADR (the ADR names the token-bucket/daily-cap *behavior*, §6.1, but not a table). New
table, provisioned in `infra/lib/crm-data-stack.ts` alongside `crm-leads`:

| Item key | Attributes | Purpose |
| --- | --- | --- |
| `PK=USER#{sub}#MIN#{windowMinute}` | `count` (atomic ADD) | 5 asks/min/user (token-bucket-equivalent, conditional `UpdateItem`) |
| `PK=USER#{sub}#DAY#{yyyy-mm-dd}` | `costCents` (atomic ADD) | $3/day spend cap, checked before each model call from an estimated cost |

Conditional expression on both: `attribute_not_exists(PK) OR count < :limit` (or `costCents <
:capCents`), the same atomic-conditional-write pattern `leadService`'s `expectedSequence` already
uses — correct under concurrent asks from one Lambda-per-request model.

## New this round: conversation memory (`ConversationEventStore`, DynamoDB adapter)

Per ADR §6.1 (DynamoDB fallback chosen this round, not AgentCore Memory — see research.md):
`PK=THREAD#{threadId}`, `SK=EVT#{ordinal}`, items are `{type: user_turn|plan|tool_call|answer,
...}`, TTL 7 days. `sessionId=threadId`, `actorId=Cognito sub` map 1:1 to the ADR's AgentCore-Memory
field names so a later swap to that adapter needs no event-shape change.

## New this round: review/learning records (ADR §7, this round builds the write path only)

`INTERP#{hash(normalisedQuestion)}`, `ALIAS#{normalisedText}` (review-gated, never auto-promoted),
`FEEDBACK#{traceId}` — as specified in ADR §7, stored as prefixed items in the same table as
`ConversationEventStore` (or `crm-agent-usage`; builder's choice, not architecturally significant).

## New this round: RoofingCrm dashboard + DLQ alarm wiring (AC-6, no new storage entity)

No new entity — this is CDK/CloudWatch config. `infra/lib/crm-sync-stack.ts`'s existing
`addFetchPartDlqAndAlarm()` + `alarmEmail` prop (porygon's finding: already built, just confirm
it's instantiated with `eng.heba.gaber@gmail.com`) plus a new `cloudwatch.Dashboard` named
`RoofingCrm` in `infra/lib/crm-ops-stack.ts`, with widgets over existing/new metrics
(`AgentAnswerLatencyMs`, `AgentCitationGroundednessRate` ≈ ADR's `GroundednessViolations`/
`AgentOutcome`, DLQ depth, golden-query pass rate).

## New this round: data-publication reference (AC-7, spec.md "Key Entities")

No new storage entity — a constant,
`bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute`, read by the existing `LeadIndex`
port and set through `DATA_MANIFEST_CID` (`packages/config`), as described in constitution B1 and
`docs/architecture-constitution.md` §7.
