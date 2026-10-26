# B-07 agent design consults (read-only, constitution Article XIV)

## B1 — `mew`, lead key and event model (2026-10-24)

**Brief:** Read stories/B-07-leads.md, docs/architecture-constitution.md ADR-04 and §12 P0-6. Confirm the lead key `{fips}:tcad:{request_identifier}` (never `property_cid`) and the gapless event-sourced history model (`EVT#{sequence}`, never sorted by time); status/assignee as a projection replayed from events, a separate immutable signals snapshot. Say what, if anything, needs to change for this story's DynamoDB design. Do not write code.

**Answer (verbatim):**

> Confirmed, no change needed.
>
> **Lead key:** ADR-04 and §12 P0-6 fix `{fips}:tcad:{request_identifier}` as the sole lead identity/dedup key, `property_cid` explicitly forbidden. B-07's AC-2, FR-002, and NFR-001 all reference this key via a DynamoDB conditional transaction (not read-then-write) — consistent.
>
> **Event history:** ADR-04 fixes gapless event-sourced history (`EVT#{sequence}`, never `HIST#{ts}` or a mutable `version` attribute), with status/assignee as a projection replayed from events, and signals as a separate immutable snapshot using exact `contract/v1` column names. §10's "Lead integrity" NFR row makes this explicit: "a write that targets an already-taken `EVT#{sequence}` is refused... not a mutable `version` attribute." B-07's AC-1 (signals snapshot + `sourceManifestCid`), AC-3 (status/note persist, replayed), and the edge case (20 concurrent creates → exactly 1 winner) match this model exactly.
>
> **What still needs to happen, not change:** ADR-04 deliberately defers the full item shapes (`pk`/`sk`, attribute names, GSIs for the lead list's filters) to `specs/007-leads/agent-design.md`, to be written at story time per constitution Article XIV. That consult hasn't happened yet for this story — it's the next step (mew + metagross, before `/speckit-plan`), not a correction to ADR-04.
>
> One gap worth flagging during that consult: AC-5's "not in Run {n}" state is computed at read time per §7 ("the sync job never edits or deletes a lead... computed at read time"), so the lead item itself doesn't need a staleness flag — the design doc should state this explicitly so metagross doesn't invent a redundant mutable status field for it.
>
> No other DynamoDB design elements in B-07 conflict with ADR-04 or P0-6.

---

## B2 — `metagross`, DynamoDB shapes + tRPC + UI (2026-10-24)

**Brief:** Given mew's confirmed key and event model, propose the DynamoDB table/GSI design (assignee and status lookups), the tRPC procedures (`leads.create`, `leads.updateStatus`, `leads.addNote`, `leads.list`), and the lead-list UI with URL-encoded filters. Do not write code.

**Answer (verbatim):**

> **1. DynamoDB (table `crm-leads`)**
> - Lead item: `pk={fips}:tcad:{request_identifier}`, `sk=LEAD`, created via `TransactWriteItems` with `ConditionExpression attribute_not_exists(pk)` → gives AC-2/NFR-001 atomically.
> - Events: same `pk`, `sk=EVT#{sequence}` (zero-padded), each event condition-checks `sequence = currentMax+1` in the same transaction — gapless, no lost updates.
> - Projection: status/assignee live only on the `sk=LEAD` item, rebuilt by replaying `EVT#` items (or updated transactionally alongside the event write — either is fine, not both independently).
> - Signals snapshot: `sk=SIGNALS`, immutable, written once at create, exact `contract/v1` column names, includes `sourceManifestCid`.
> - GSIs: `GSI1` (assignee lookup) pk=`assigneeId`, sk=`createdAt` or `pk`; `GSI2` (status lookup) pk=`status`, sk=`createdAt`. Roof-age/permit-status/radius filtering happens against the search index (DuckDB), not DynamoDB — DynamoDB only needs assignee/status GSIs plus the lead's own key.
> - "Not in Run n": no stored flag — confirmed correct per mew and ADR-04/§7; computed at read time by comparing the lead's referenced property key against current `META#index`.
>
> **2. tRPC:** `leads.create` (transact write LEAD+SIGNALS+EVT#0, Zod input, maps `ConditionalCheckFailed`→`ALREADY_EXISTS`), `leads.updateStatus` (append EVT#, update projection), `leads.addNote` (append EVT#, note ≤4000 chars), `leads.list` (cursor pagination, roof-age/permit-status/radius filters forwarded to the DuckDB/LeadIndex port, not DynamoDB scan; assignee/status via GSIs when unfiltered by geography).
>
> **3. UI:** filters encoded as query params (nuqs-style), Atlas `FilterChip`/`DataChip` for provenance, `MissingValue` for "not in Run n", no business logic in components.
>
> No disagreement with mew — his key/event model and read-time staleness computation are sound and I've built directly on them.

**Disagreements table**

| Topic | mew | metagross | Resolution |
| --- | --- | --- | --- |
| — | — | — | None. metagross builds directly on mew's key/event model; GSI naming (GSI1 = assignee, GSI2 = status) was metagross's call per Round 1 D-1. |
