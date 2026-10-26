# Data model: B-07 leads

Source: `agent-design.md` (mew's key/event model, metagross's item shapes), ADR-04, `../assessment-guide/reference/B-roofing-crm.md` §4.

## Table: `crm-leads` (DynamoDB)

One table, three item types sharing `pk`:

| Item | `pk` | `sk` | Notes |
|---|---|---|---|
| Lead (projection) | `{fips}:tcad:{request_identifier}` | `LEAD` | Current status/assignee — the only mutable item |
| Signals snapshot | `{fips}:tcad:{request_identifier}` | `SIGNALS` | Immutable, written once at create |
| History event | `{fips}:tcad:{request_identifier}` | `EVT#{sequence}` (zero-padded, e.g. `EVT#0000000003`) | Immutable, append-only, gapless |

### `sk=LEAD` attributes

| Attribute | Type | Notes |
|---|---|---|
| `pk` | string | `{fips}:tcad:{request_identifier}` — never `property_cid` (ADR-04, P0-6) |
| `sk` | string | `LEAD` |
| `leadId` | string | ULID, assigned at create, stable identifier for links/URLs (the `pk` stays the dedupe key) |
| `address` | string | Copied at creation from the property/permit record |
| `lat`, `lon` | number | Copied at creation |
| `status` | enum | `new` \| `contacted` \| `qualified` \| `won` \| `lost` |
| `assignee` | string | The creating rep (single shared test user for this assessment) |
| `createdFrom` | enum | `map` \| `list` \| `agent` (this story builds `map` and `list`; `agent` is B-09's path, same procedure) |
| `sourceManifestCid` | string | The manifest CID the property/permit was read from at creation |
| `createdAt` | string (ISO) | |
| `eventSequence` | number | Current max `EVT#{sequence}`, updated transactionally with each append — lets a write assert "my event is `eventSequence + 1`" without a separate query |

No staleness/"not in Run {n}" field is stored on this item — computed at read time (see below).

### `sk=SIGNALS` attributes

| Attribute | Type | Notes |
|---|---|---|
| `roofAgeYears`, `roofAgeBasis` | number, string | Exact `contract/v1` column names, copied verbatim |
| `openPermitId`, `openDays` | string, number | |
| `contractor` | string | |
| `bbbRating` | string \| missing-reason | Only shown as a rating when `bbb_status = rated` (constitution §12 P0-4) |
| `capturedAt` | string (ISO) | When the snapshot was taken (creation time) |

### `sk=EVT#{sequence}` attributes

| Attribute | Type | Notes |
|---|---|---|
| `sequence` | number | Matches the `{sequence}` in `sk`, gapless, condition-checked on write |
| `at` | string (ISO) | |
| `by` | string | Rep who made the change |
| `change` | string | e.g. `status: new -> contacted`, `note: "..."` |
| `kind` | enum | `create` \| `statusChange` \| `note` |

## GSIs

| GSI | pk | sk | Used by |
|---|---|---|---|
| `GSI1` (assignee) | `assignee` | `createdAt` | "my leads" views |
| `GSI2` (status) | `status` | `createdAt` | Status-board-style views |

Only applied to `sk=LEAD` items (events and signals are never queried by GSI).

## "Not in Run {n}" (AC-5, computed, not stored)

At read time, compare the lead's `sourceManifestCid` (captured at creation, on the `SIGNALS` item) against the currently served `META#index` pointer's manifest. If the property/permit the lead references is no longer present under the current manifest's coverage, the lead detail view shows "not in Run {n}" instead of the (now potentially stale) signals. This never mutates the lead; a re-platted property reappearing in a later run clears the state automatically on the next read. (Round 1 D-2; architecture-constitution.md §7.)

## Zod schemas (`packages/shared/src/schemas/lead.ts`)

- `Lead` — the `sk=LEAD` shape above, minus `pk`/`sk` (exposed as `leadKey`/`leadId` instead).
- `LeadSignals` — the `sk=SIGNALS` shape above.
- `LeadEvent` — the `sk=EVT#` shape above.
- `LeadFilters` — `{ roofAgeMinYears?, permitStatus?, radiusMi?, centerLat?, centerLon? }`, the URL-encoded filter state shared between the lead list and the map.

## State transitions (`status`)

`new → contacted → qualified → (won | lost)`. No transition is blocked at the data layer in this story (the UI offers all five as options); a future story could add a workflow guard without changing the item shape.
