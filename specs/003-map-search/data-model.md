# Phase 1 data model: B-03 map search

This story adds no new persisted row shape — `crm_property`/`crm_permit` (B-02's
`packages/index-schema`) are unchanged. It adds (1) request/response shapes for two new tRPC
procedures, and (2) the pure domain functions that compute radius membership and the long-open
badge from the existing fields.

## `search.properties` request / response

| Field | Type | Notes |
| --- | --- | --- |
| `center` | `{ lat: number, lng: number }` | Required; Zod-validated to valid lat/lng ranges |
| `radiusMi` | number, 0.5–25 | Required; Zod `.min(0.5).max(25)` (FR-001, architecture-constitution.md §6) |
| `roofAgeMinYears` | integer, optional, default 15 | FR-003 |
| `limit` | integer, optional, ≤ 100 | architecture-constitution.md §6's page-limit bound |
| → `properties` | `Provenanced<CrmProperty>[]` | Verbatim `CrmProperty` fields (B-02); each carries `sourceManifestCid` |
| → `counts` | `{ afterRadius: integer, afterRoofAge: integer }` | `afterRoofAge` is what AC-4's threshold-change comparison reads; both counts run over the full index, never a cached subset |
| → `manifestCid`, `traceId` | string | Provenance for the whole response (constitution XI) |

## `search.permits` request / response

| Field | Type | Notes |
| --- | --- | --- |
| `center`, `radiusMi` | as above | Same radius as the property search (one shared search state) |
| `sort` | `"openDays"` | Fixed to open-duration-descending for this story (AC-5); the existing `LeadIndex.searchPermits` already supports this value |
| → `permits` | `Provenanced<CrmPermit>[]` | Sorted longest-open first; each row's `isLongOpen` flag (from `packages/domain`) is computed in the response mapper, not stored |

## `property.get` request / response

| Field | Type | Notes |
| --- | --- | --- |
| `propertyCid` | CID string | Required |
| → `property` | `Provenanced<CrmProperty>` or `null` | `null` (not a thrown error) when the CID isn't in the currently promoted run (per the existing `LeadIndex.getProperty` contract, B-02) |
| → `permits` | `Provenanced<CrmPermit>[]` | Joined by `propertyCid`, per the existing adapter |
| → `bbbStatus`, `bbbStatusReason` | enum, string, nullable | Read verbatim from the vendored `v_contractor`/`v_roofing_permit` columns (`packages/oracle-contract/src/columns.ts`); drives AC-7's "not available" state |
| → `lineageUrl` | string | "View lineage in Explorer" — a constructed link back to Task A's published record for this `propertyCid`/`cid`, new in the CRM (not in B-02's contract) |

## `packages/domain` pure functions (new)

| Function | Signature | Notes |
| --- | --- | --- |
| `bboxFor` | `(center: {lat,lng}, radiusMi: number) => BoundingBox` | Same bbox-prefilter shape as the vendored `oracle-views`' `geo()` (see research.md) |
| `distanceMeters` | `(a: {lat,lng}, b: {lat,lng}) => number` | Haversine; used both to cut the exact circle and to sort "nearest first" |
| `isLongOpen` | `(openDays: number \| null) => boolean` | `openDays != null && openDays > 1826` |
| `openDurationLabel` | `(openDays: number \| null) => string` | Human-readable label (e.g., "open 6.2 years"); never recomputes `openDays` itself |

## Validation rules carried from the spec (not re-stated as new rules)

- `radiusMi` MUST be within 0.5–25 inclusive; a value outside that range is a Zod validation error,
  never silently clamped (FR-001).
- `roofAgeMinYears` changes MUST be evaluated over the complete index for every value — `counts`
  in the response is always computed fresh, never cached per threshold (FR-004).
- A property with `roofAgeYears = null` is never filtered out of a radius-only query; it only drops
  out once a roof-age threshold is applied, and even then its `missingReasons` entry is preserved
  on any row where it's still shown (FR-003, carried from B-02's data-model.md).
- `bbb_status !== "rated"` always surfaces `bbb_status_reason` in the response — the field is never
  omitted and never backfilled with an invented rating (FR-007).
