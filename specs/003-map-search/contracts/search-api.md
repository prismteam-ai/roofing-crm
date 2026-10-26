# Contract: `search.properties` / `search.permits` (new tRPC procedures)

These are new procedures on the existing `appRouter` (`apps/api/src/routers/index.ts`), calling
the existing B-02 `LeadIndex` port (`apps/api/src/adapters/duckDbParquet.ts`) with one addition:
`SearchPropertiesQuery` gains `center`/`radiusMi`, converted to the existing `bbox` field via
`packages/domain`'s `bboxFor` before the adapter's own haversine cut, so the port's shape
(`BoundingBox`, `roofAgeMinYears`, `limit` — already defined in B-02) does not change, only how the
caller builds its `bbox`.

## `search.properties`

**Input** (Zod): `{ center: { lat: number, lng: number }, radiusMi: number (0.5–25), roofAgeMinYears?: number, limit?: number (≤100) }`

**Behavior**:
1. Compute `bbox = bboxFor(center, radiusMi)` (`packages/domain`).
2. Call `leadIndex.searchProperties({ bbox, roofAgeMinYears, limit })` — the existing B-02 adapter method, unchanged.
3. Apply the exact-circle cut: keep only rows where `distanceMeters(center, row) < radiusMi * 1609.344`, sorted nearest first (the bbox is a superset; this is the same two-step shape as the vendored `radiusSql`, see research.md).
4. Compute `counts.afterRadius` (post-circle-cut count, pre-roof-age) and `counts.afterRoofAge` (post-both) by running the same pipeline once with `roofAgeMinYears` omitted and once with it applied — both over the full index, never a cached value (FR-004/AC-4).
5. Return `{ properties, counts, manifestCid, traceId }`.

**Error contract**: Zod validation error on malformed input; `INDEX_NOT_READY` (from the underlying `LeadIndex`) maps to a typed "index not ready" UI state, never a 500 (existing B-02 error contract, unchanged).

## `search.permits`

**Input** (Zod): `{ center: { lat: number, lng: number }, radiusMi: number (0.5–25), sort: "openDays" }`

**Behavior**:
1. Compute `bbox` the same way as above.
2. Call `leadIndex.searchPermits({ bbox-derived propertyCid filter via the radius result set, sort: "openDays" })` — joins through the same radius-filtered property set as `search.properties`, so the two never disagree on which properties are in scope (SC-06).
3. Attach `isLongOpen` (`packages/domain`) to each returned permit — a display-layer flag, not a stored field.
4. Return `{ permits, manifestCid, traceId }`, sorted longest-open first (AC-5).

**Error contract**: same as `search.properties`.

## Acceptance mapping

| AC | Covered by |
| --- | --- |
| AC-1 | `search.properties`, step 3 (exact-circle cut) |
| AC-2 | Not this contract — handled client-side by the Geolocation API's denial callback (see `apps/web/src/components/Map/GpsButton.tsx` in plan.md) |
| AC-3 | `search.properties`, `roofAgeMinYears` input + `roofAgeBasis`/`roofAgeConfidence` on each returned row (unchanged `CrmProperty` fields) |
| AC-4 | `search.properties`, step 4 (`counts.afterRoofAge`, always computed fresh) |
| AC-5 | `search.permits`, steps 3–4 |
| AC-6, AC-7 | `property.get` (see `property-detail.md`) |
