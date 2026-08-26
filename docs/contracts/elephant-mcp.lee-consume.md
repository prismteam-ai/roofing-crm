# Elephant MCP consume contract — Lee (template)

**Captured:** 2026-08-21 via live `@elephant-xyz/mcp` (`getPropertyQuerySchema("lee")`, `getPermitQuerySchema("lee")`).  
**Status:** Template for `packages/elephant-client` Zod. **Not** the Chester freeze.

Chester **query-table** is reachable (`getOracleDatasetInfo("chester")` → 7,829 rows, 2026-08-21) but **`listPublishedCounties` still omits `chester`**. Do not flip `defaultCounty` on dataset-info. After the **catalog** lists `chester` with usable lat/lng, re-run the same tools and record diffs here (clip key, `built_year` coverage, count vs 7,851).

## Properties view (`queryProperties`) — Lee, 37 columns

| Column                   | DuckDB type | CRM use                                |
| ------------------------ | ----------- | -------------------------------------- |
| `property_id`            | VARCHAR     | Lead key, `properties.get`             |
| `property_cid`           | VARCHAR     | Evidence / citation                    |
| `request_identifier`     | VARCHAR     | Pass-through                           |
| `parcel_identifier`      | VARCHAR     | Folio / APN in drawer                  |
| `source_system`          | VARCHAR     | Pass-through                           |
| `county_name`            | VARCHAR     | Honest UI copy                         |
| `state_code`             | VARCHAR     | Honest UI copy                         |
| `address_street`         | VARCHAR     | List + snapshot                        |
| `address_city`           | VARCHAR     | Possible Chester clip if no `gis_muni` |
| `address_zip`            | VARCHAR     | Drawer                                 |
| `latitude`               | DOUBLE      | Map + Haversine                        |
| `longitude`              | DOUBLE      | Map + Haversine                        |
| `lot_size_acre`          | DOUBLE      | Optional; often NULL                   |
| `lot_area_sqft`          | DOUBLE      | Optional                               |
| `exterior_wall_material` | VARCHAR     | Optional                               |
| `roof_covering_material` | VARCHAR     | Material only — **not** age            |
| `property_type`          | VARCHAR     | Drawer                                 |
| `property_usage_type`    | VARCHAR     | Drawer                                 |
| `built_year`             | BIGINT      | Aging-roof proxy                       |
| `livable_floor_area`     | DOUBLE      | Optional                               |
| `total_area`             | DOUBLE      | Optional                               |
| `assessed_value`         | DOUBLE      | Optional                               |
| `market_value`           | DOUBLE      | Optional                               |
| `land_value`             | DOUBLE      | Optional                               |
| `avm_value`              | DOUBLE      | Optional                               |
| `owner_name`             | VARCHAR     | Snapshot; do not invent                |
| `owners_text`            | VARCHAR     | Searchable                             |
| `owner_count`            | BIGINT      | Optional                               |
| `owner_occupied`         | BOOLEAN     | Optional                               |
| `last_sale_date`         | VARCHAR     | Optional                               |
| `last_sale_price`        | DOUBLE      | Optional                               |
| `subdivision`            | VARCHAR     | Optional                               |
| `has_permits`            | BOOLEAN     | Permit-layer probe                     |
| `permit_count`           | BIGINT      | Drawer                                 |
| `has_sunbiz_tenant`      | BOOLEAN     | Not a lead filter                      |
| `has_bbb_contractor`     | BOOLEAN     | Show BBB only when present             |
| `hoa_flag`               | BOOLEAN     | Often NULL                             |

**Not on this view:** `gis_muni`. Do not clip Lee with Chester MUNI `1`/`16`.

**Nullability:** coverage varies. `hoa_flag`, materials, acreage, and enrichment flags may be NULL. `built_year` NULL → exclude from aging-roof layer only.

## Permits

`getPermitQuerySchema("lee")` → **unserved**. Do not call `queryPermits` for Lee.

Permit path (AC-7): probe schema; on failure use `getOracleProperty.permits[]` for candidates with `has_permits`. No invented close dates. Empty BBB is valid.

## Forbidden from this CRM

`getPropertyPermits`, Neon SQL, IPFS/Filebase from the browser or this API, places/colocation tools, harvest.

## Chester freeze (still required — catalog + geo)

When **`listPublishedCounties` includes `chester`** (not merely dataset-info):

1. `getPropertyQuerySchema("chester")` vs this table (still 37 columns as of 2026-08-21; **no `gis_muni`** — clip may be `address_city` `WEST CHESTER, PA` / `COATESVILLE, PA`).
2. Query-table **lat/lng populated** (currently **0** on the view; map cannot use Chester until export includes centroids).
3. `getOracleDatasetInfo("chester")` count vs pilot **7,851** (live **7,829**).
4. `getPermitQuerySchema("chester")` — still unserved; `has_permits` all false.
5. `built_year` coverage (live **0**) — aging-roof empty until a source exists.
