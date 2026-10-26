# Agent design consult — B-03 (metagross, read-only)

1. **Query shape (ADR-01, DuckDB over Parquet, same path for map and agent per §2.4's sequence diagram):** one tRPC query, e.g. `search.properties({ center: { lat, lng }, radiusMi: number (0.5–25), roofAgeThreshold?: number (default 15), permitView?: boolean })`. Server does one DuckDB pass: bbox + haversine filter by `center`/`radiusMi`, then `roofAgeYears >= roofAgeThreshold` when set, then permit sort when `permitView`. Response: `{ properties: CrmProperty[], permits?: CrmPermit[], counts: { afterRadius, afterRoofAge }, manifestCid, traceId }` — field names verbatim from `packages/index-schema`, never renamed for the UI.

2. **Exact field names (from `CrmProperty`/`CrmPermit`, index-schema/src/index.ts):** roof age basis/confidence = `roofAgeYears`, `roofAgeBasis` (enum: `permit` | `new_construction` | `built_year` | `unknown`), `roofAgeConfidence` (enum: `high` | `medium` | `low` | `none`). Permit open-days/status = `openDays` (int, nullable), `statusClass` (string, nullable — a null `improvementStatus` must already have arrived as `statusClass: "stalled"`, constitution P0-4; never recomputed here per ADR-07).

3. **Permit sort + long-open badge:** sort the permit result array by `openDays` descending (nulls/not-open last). Badge rule: show "long-open" when `openDays != null && openDays > 1826` (5 years × 365.25 ≈ 1826 days) — a strict boolean on the vendored `openDays` value, never re-derived from `issueDate`.

4. **Detail-drawer provenance + BBB-absent state:** every row/drawer shows its `cid`, `sourceManifestCid`, `capturedAt`, `runId`, and any `missingReasons[]` entries (ProvenanceFields, §7). Contractor/BBB comes from the vendored `v_contractor`/`v_roofing_permit` columns (`packages/oracle-contract/src/columns.ts`): `bbb_status` (enum `rated` | `not_found` | `blocked` | `not_checked` — always `not_checked` in v1 per the `BBB_SOURCE` constant) and `bbb_status_reason` (e.g. `contractor_unresolved` or `no_lexicon_carrier`). When `bbb_status !== "rated"`, the drawer must render "BBB rating not available" plus the literal `bbb_status_reason` text — never a blank field, never an invented rating.

## Disagreements

| Topic | metagross | Other consult | Resolution |
| --- | --- | --- | --- |
| — | — | — | None — sole design consult on this story. |
