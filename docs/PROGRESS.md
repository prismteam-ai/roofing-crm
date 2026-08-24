# Progress — Roofing CRM vs pipeline / MCP

**As of 2026-08-21 (evening probe).** [Slowking](https://github.com/soofi-xyz/soofi-xyz-team-kit) consume check. Not a hiring score.

## Verdict

| Question                                              | Status                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| **Lee-fallback execute** (`/plan-feature` US-001…018) | **Ready.** Catalog includes `lee`. Scaffold metagross now.        |
| **Chester as product default**                        | **Not ready.** `listPublishedCounties` still **omits** `chester`. |

**Trap:** `getOracleDatasetInfo("chester")` now returns **`propertyCount`: 7829** (query-table IPNS). That is a **side channel**, not a catalog listing. `counties.defaultCounty` must key off **`listPublishedCounties`**, not dataset-info. Do not flip the UI to Chester.

---

## Live MCP (re-probed)

**Catalog** (`listPublishedCounties`, `generatedAt` 2026-08-14): `lee`, `miami-dade`, `orange`, `palm-beach`, `rock-island`. **No `chester`.**

**Chester query table** (direct `county: "chester"`):

| Fact                     | Value                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Rows                     | **7,829** (pilot target 7,851; −22)                                                            |
| Schema                   | Same **37** Lee-shaped columns; **no `gis_muni`**                                              |
| `latitude` / `longitude` | **0** populated on the query table → `findPropertiesInArea` empty                              |
| `built_year`             | **0** populated                                                                                |
| `has_permits`            | **0** true                                                                                     |
| `address_city`           | `WEST CHESTER, PA` 4,050; `COATESVILLE, PA` 3,693; `PA` 86                                     |
| Permit SQL               | **Unserved**                                                                                   |
| Consolidated JSON        | `getOracleProperty` works; sample had lat/lng on **address**, `permits: []`, `builtYear: null` |

**Lee** this session: `getOracleDatasetInfo("lee")` **timed out**. Catalog still lists a Lee property table. First `search.inRadius` against Lee may need retries; do **not** fall back to seed CSV or Chester’s incomplete table as a substitute.

---

## Pipeline (local, not MCP)

Earlier today: scoring smoke **21/21**; pilot job captured 7,851 / loaded **7,829** in **local Postgres** with centroids. That Postgres is an operator diagnostic — **this CRM must not query it.** IPNS URLs in `oracle-pi-challenge` `chester.json` may still be placeholders; the query-table IPNS above is what MCP used for dataset-info.

---

## What this unlocks for the CRM

- **Execute Lee-fallback now:** Amplify + tRPC + DynamoDB + MapLibre on **live Lee**, honest unpublished-catalog banner.
- **Design freeze (consume later):** Chester identity + city strings exist; **map/aging/permits do not** until geo, `built_year`, and permits are on the query table **and** the catalog lists `chester`.
- Clip later via `address_city` (`WEST CHESTER, PA` / `COATESVILLE, PA`) or a future `gis_muni` — implement `gisMuni?` now, **apply `[1,16]` only after catalog includes `chester`**.

## What it does not unlock

West Chester/Coatesville live map, aging-roof layer on Chester, 7,851 coverage chrome, long-open permits, BBB, or treating 7,829 side-channel rows as “Chester is published.”

---

## Next

**This repo:** execute `lee-fallback-map-crm-foundation` (VERIFY AC-1…12). Kit: metagross + donphan (Lee) + uidev + smeargle.

**Pipeline / oracle-pi:** put `chester` on `listPublishedCounties`; export lat/lng (and year-built if any) onto the query table; permit adapter; coverage copy 7,829 vs 7,851 honesty.

## Do not

- Flip `defaultCounty` because dataset-info answers
- Query pipeline Postgres or seed CSV from this CRM
- Label Lee parcels as Chester
- Invent roof-install years or permit close dates
