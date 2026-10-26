# tRPC contract: `leads` router

All procedures sit behind the Cognito JWT authorizer (constitution §12 P0-11). Every input is Zod-validated.

## `leads.create`

**Input**
```ts
{
  fips: string;
  requestIdentifier: string;        // -> pk = `${fips}:tcad:${requestIdentifier}`
  address: string; lat: number; lon: number;
  signals: { roofAgeYears?: number; roofAgeBasis?: string; openPermitId?: string;
             openDays?: number; contractor?: string; bbbRating?: string };
  sourceManifestCid: string;
  createdFrom: "map" | "list" | "agent";
}
```

**Behavior**: One `TransactWriteItems` call writes `LEAD` + `SIGNALS` + `EVT#0` (kind `create`), condition-checked on `attribute_not_exists(pk)` for the `LEAD` item.

**Output**: `Lead` (the `sk=LEAD` shape, data-model.md) on success.

**Errors**: `ConditionalCheckFailed` → `cause.code: "ALREADY_EXISTS"` (UI shows "Already a lead", AC-2). Under 20 concurrent calls for the same key, exactly one succeeds; the other 19 receive `ALREADY_EXISTS` (NFR-001).

## `leads.updateStatus`

**Input**: `{ leadKey: string; status: "new"|"contacted"|"qualified"|"won"|"lost" }`

**Behavior**: One transaction: append `EVT#{currentMax+1}` (kind `statusChange`, condition-checked on the sequence), update `LEAD.status` and `LEAD.eventSequence`.

**Output**: Updated `Lead`.

**Errors**: `ConditionalCheckFailed` on the sequence check (concurrent write lost the race) → caller retries with the fresh `eventSequence` (0 lost updates, NFR row in §10).

## `leads.addNote`

**Input**: `{ leadKey: string; text: string }` — `text` ≤ 4,000 chars (constitution §6 validation boundary).

**Behavior**: Same append pattern as `updateStatus`, kind `note`.

**Output**: Updated `Lead` (notes are derived from the event log, not stored separately on `LEAD`).

## `leads.list`

**Input**
```ts
{
  filters?: { roofAgeMinYears?: number; permitStatus?: "open"|"closed"|"stalled";
              radiusMi?: number; centerLat?: number; centerLon?: number };
  assignee?: string; status?: "new"|"contacted"|"qualified"|"won"|"lost";
  cursor?: string; limit?: number;   // limit <= 100 (constitution §6)
}
```

**Behavior**: `roofAgeMinYears`/`permitStatus`/`radiusMi` are forwarded to the existing `LeadIndex`/search port (DuckDB over Parquet) — the same query path the map uses, so list and map counts agree (AC-4). `assignee`/`status` alone (no geo filter) query `GSI1`/`GSI2` directly.

**Output**: `{ leads: Lead[]; nextCursor?: string; totalCount: number }`, each `Lead` annotated with a client-computed-or-server-flagged `notInCurrentRun: boolean` (AC-5, read-time comparison against `META#index`, never stored).

## `leads.get`

**Input**: `{ leadKey: string }`

**Output**: `Lead & { signals: LeadSignals; notes: LeadEvent[]; history: LeadEvent[]; notInCurrentRun: boolean }` — full detail view, events replayed into `notes`/`history` by `kind`.

**Errors**: `NOT_FOUND` if no `LEAD` item exists for the key.
