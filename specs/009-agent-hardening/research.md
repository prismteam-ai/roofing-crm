# Phase 0 research: B-09 agent + hardening

No `[NEEDS CLARIFICATION]` remained in spec.md, so this phase resolves implementation-level
unknowns against existing, binding sources rather than open research questions.

## Decision: use the existing ADR-06 agent architecture as the technical design, not a new one

**Decision**: `docs/decisions/0000-agent-architecture.md` (alakazam's chosen contract, accepted as
ADR-06 in `docs/architecture-constitution.md`, 2026-10-23) is the binding technical design for the
agent. Nothing under it is implemented yet (confirmed: no `agent.ts`/`rag/ports.ts`/`thresholds.ts`
exist in `apps/api`/`packages/shared`/`packages/domain`) — B-09 builds it, it doesn't redesign it.

**Rationale**: it is already PO-accepted, already reconciles alakazam's and metagross's competing
proposals, and already has a full `AgentAnswer`/`QueryPlan` Zod shape, tool table, confidence
bands, telemetry plan, golden-query grading rules and code patterns (§10). Re-deriving it from this
round's fresh design consults (`agent-design.md`) would create two competing contracts for the same
feature. Where the fresh consults differ from the ADR in free-text wording (confidence-band
recommendation, field names in a sketched `AgentAnswer`), the ADR wins — see `agent-design.md`'s
"Corrections found while compiling."

**Alternatives considered**: build net-new from the fresh design consults alone — rejected, it
would duplicate and partially contradict already-accepted work and waste the prior alakazam
consult's calibration work (gazetteer, confidence bands, golden-query grading table already
written to §9 of the ADR).

## Decision: data source is Task A's published Run 2 manifest, read directly by CID

**Decision**: every tool that reads property/permit data (`resolvePlace` via gazetteer,
`searchProperties`, `searchPermits`, `getProperty`) resolves against
`bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute` through the existing
`LeadIndex`/`DuckDbParquetLeadIndex` port (`apps/api/src/leadIndex.ts`,
`apps/api/src/adapters/duckDbParquet.ts`) — the same index the B-03 map/B-07 lead flows already
use. The ADR's `oracleCoverage` tool (gated on A-14) and any MCP-backed `getCoverage` path are
**not built this round**; they stay a documented future addition.

**Rationale**: constitution B1 — the CRM reads Task A's published data directly. The manifest is
pinned and real, and reading it by CID through the existing
index port requires no new data-access code — `leadIndex` already reads by manifest, and B-02's
sync job already promotes a run by CID.

**Newer runs:** pointing the CRM at a later Task A run is a change to `DATA_MANIFEST_CID` plus a
re-sync, no code change (`docs/architecture-constitution.md` §7). The MCP stays an optional
cross-check, never the data path.

## Decision: builder split follows the story front matter exactly

**Decision**: three task groups — `alakazam` (retrieval: tools, place resolver, citation verifier,
golden harness, `packages/shared/src/rag/ports.ts` + `thresholds.ts`), `ash` (agent runtime: the
`agent.ask`/`agent.confirmLead` router, `getModel`/`AI_PROVIDER` switch, tool loop, rate/spend
guards, `ConversationEventStore` DynamoDB adapter), `metagross` (Ask UI screens/states, responsive
config, `RoofingCrm` CloudWatch dashboard, DLQ-alarm email wiring, agent business metrics, AC-8
re-diff fixes).

**Rationale**: matches `stories/B-09-agent-hardening.md` front matter and `agent-design.md`'s "Net
effect" section exactly; no new agent needed beyond the four already consulted plus the three
already-named builders.

**Alternatives considered**: a fourth task group for observability alone — rejected, porygon's
pieces (metrics, dashboard, DLQ-alarm wiring) are small additions to existing infra (`crm-sync-stack.ts`
already has the DLQ+alarm construct) and fit naturally under `metagross`'s existing
responsive+observability builder role per the story's own assignment.

## Decision: `ConversationEventStore` adapter is DynamoDB, not AgentCore Memory, for this round

**Decision**: implement the `DynamoDbConversationEventStore` fallback named in ADR-06 §6.1, not
AgentCore Memory.

**Rationale**: already decided in ADR-06's acceptance note ("AgentCore Memory creation on the free
plan is unproven; alakazam itself names DynamoDB as the fallback, so it is the safer default").
Nothing in this round's consults changes that calculus — still a $120-credit free-tier AWS account.

## Decision: confidence bands and outcome-state names follow ADR-06 verbatim

**Decision**: auto ≥ 0.92, clarify 0.80–0.92 (or margin < 0.05), refuse (`not_found`) < 0.80;
out-of-scope ZIP/place handled separately as `out_of_scope`. Outcome enum is ADR-06's nine values
(`answered, empty_in_scope, out_of_scope, not_found, needs_clarification, field_not_published,
timed_out, rate_limited, paused`), not the shorter set either fresh consult sketched.

**Rationale**: see `agent-design.md` correction #1 — this is an already-accepted decision, not a
new one. The story's spec/edge-case text is corrected to match during this plan (see data-model.md).

## Decision: prototype screens are read from `design/prototype/CrmAsk*.dc.html`

**Decision**: use the confirmed, existing file paths, not the story's stale `design/screens/` table.

**Rationale**: `ls design/prototype/` confirms these files exist there; `design/screens/` doesn't
exist in this repo. See `agent-design.md` correction #2.
