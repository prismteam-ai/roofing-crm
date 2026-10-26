# Contract: `LeadIndex` port (what this story builds for every later story to call)

This is the CRM-owned read contract that B-03 (map search), B-07 (leads) and B-09 (agent) call. It is not Task A's contract — it is the interface this story's `apps/api/src/adapters/duckDbParquet.ts` implements over the Parquet this story writes. No technology/library choice is prescribed beyond "implemented over DuckDB per ADR-01" (already decided); this contract is the shape, not the SQL.

## `indexInfo(): IndexInfo`

Returns the currently promoted run's metadata, read from the `META#index` pointer (cached ≤ 60s per architecture-constitution.md §2.4).

```text
IndexInfo = {
  manifestCid: CID
  propertyCount: integer
  permitCount: integer
  promotedAt: timestamp
}
```

- Never returns a run whose `Validate` step has not passed (constitution P0-3: no partial promotion).
- Every caller that displays a result MUST echo this `manifestCid` as provenance (constitution XI, architecture-constitution.md §7).

## `searchProperties(query): PropertyResult[]`

```text
query = {
  bbox?: BoundingBox          // from a radius + center point, computed by the caller
  roofAgeMinYears?: integer
  propertyUsageType?: string
  limit?: integer             // page limit enforced by the caller's Zod bounds, not here
}
PropertyResult = Provenanced<CrmProperty>   // see data-model.md; sourceManifestCid always present
```

- A row with `roofAgeYears = null` is returned with its `roofAgeBasis` missing reason intact — never filtered out silently and never backfilled with a guess (FR-003).
- `owner_name` is never a field on `CrmProperty` — there is nothing to leak (ADR-03 enforced at the schema level, not by a runtime check).

## `searchPermits(query): PermitResult[]`

```text
query = {
  propertyCid?: CID
  isOpen?: boolean
  openDaysMinimum?: integer
  sort?: "openDays" | "issueDate"
}
PermitResult = Provenanced<CrmPermit>
```

- `statusClass`/`isOpen` are read verbatim from the vendored `query-core` derivation (ADR-07) — this adapter never recomputes "open" from raw dates itself.
- A permit with a null `improvementStatus` is surfaced as `"stalled"`, never `"open"` (constitution P0-4) — this is the vendored derivation's output, asserted (not re-implemented) by this adapter's tests.

## `getProperty(propertyCid): PropertyDetail | null`

Returns one property with its joined permits (via `crm_permit.propertyCid`). `null`, not a thrown error, when the CID isn't in the currently promoted run — later stories render this as a typed "not in this run" state, not a 500.

## Error/typed-state contract (for every method above)

Every method either returns its typed result or throws one of a closed set of typed errors the caller maps to a `cause.code` (constitution architecture §4, Entry layer): `INDEX_NOT_READY` (no run has ever promoted), `INDEX_COLD_LOAD_TIMEOUT` (the per-sandbox `/tmp` download exceeded its budget — tracked separately from warm search latency per the NFR table), and standard Zod validation errors on malformed query input. No other error shape crosses this port.
