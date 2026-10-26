// Thin-router extraction (tasks.md T012; agent-design.md alakazam §1: "Move the router bodies
// into services first, so the routers and the tools share one code path"). The business logic
// previously inline in routers/search.ts, unchanged: the two-call/`counts` pattern (counts are
// always computed over the full matching set, never a cached subset — FR-004/AC-4) and the
// radius-join for permits (SC-06). Routers/search.ts now only validates input and shapes the
// tRPC response (manifestCid/traceId, error mapping); the new agent tools (Phase 4,
// services/agent/tools.ts) call these same functions instead of a second copy.
import {
  isLongOpen,
  MAX_PERMIT_ROWS as DOMAIN_MAX_PERMIT_ROWS,
  MAX_PROPERTY_ROWS as DOMAIN_MAX_PROPERTY_ROWS,
} from "@crm/domain";
import { isLivePermit } from "@crm/shared";
import type {
  AddressMatch,
  CountyOverview,
  CountyOverviewQuery,
  LeadIndex,
  PermitResult,
  PropertyResult,
  SimilarPropertyRow,
} from "../adapters/duckDbParquet.js";

export interface SearchCenter {
  lat: number;
  lng: number;
}

export interface SearchPropertiesInput {
  center: SearchCenter;
  radiusMi: number;
  // `| undefined` (not just `?`) because `exactOptionalPropertyTypes` treats the router's
  // Zod-inferred `{ roofAgeMinYears?: number }` (an explicit-undefined-bearing shape once spread
  // through `{ ...input }`) as distinct from a plain optional property.
  roofAgeMinYears?: number | undefined;
  /** T043 (B-09/US2, G4): "owners outside the area." Passed straight through to the adapter's
   *  exact-match `ownerAreaClass` filter — never a second, independently-derived classification. */
  ownerAreaClass?: string | readonly string[] | undefined;
  /** T043 (B-09/US2, G4): see `SearchPropertiesQuery.tenureYearsMin`'s doc comment in
   *  `adapters/duckDbParquet.ts`. The index carries the stored `tenureYears` column, so the filter
   *  is exact (`tenureYears >= N`); rows with no tenure are left out and counted separately. */
  tenureYearsMin?: number | undefined;
  /** Web owner filter "Out-of-area": `ownerAreaClass IN ('regional','out_of_area')`. */
  outOfArea?: boolean | undefined;
  /** Permit filter (map Filters → Permit status / Permit open): applied in SQL to the whole
   *  matching set, before the limit, the order and the counts. `["open","stalled"]` is the map's
   *  "Open" (see `permitStatusClassesFor`). */
  permitStatusClass?: readonly ("open" | "stalled" | "closed")[] | undefined;
  permitOpenDaysMin?: number | undefined;
  limit?: number | undefined;
}

export interface SearchPropertiesResult {
  properties: PropertyResult[];
  /** `excludedNoRoofDate` (B-09 review, CR finding 10): rows in the radius that a roof-age
   *  filter excluded only because they carry no roof date (`roofAgeYears` null) — 0 when no
   *  roof-age filter was applied. */
  counts: {
    afterRadius: number;
    afterRoofAge: number;
    excludedNoRoofDate: number;
    /** In the radius with no tenure (a tenure filter leaves them out); 0 without one. */
    excludedNoTenure: number;
  };
  manifestCid: string;
}

/** Hard ceiling on `search.properties` rows (architecture-constitution.md section 6 page limit). */
export const MAX_PROPERTY_ROWS = DOMAIN_MAX_PROPERTY_ROWS;
/** `search.permits` page: default and ceiling (a permit row is about 0.7 KB, so even the ceiling
 *  keeps the response far below 1 MB). */
export const MAX_PERMIT_ROWS = DOMAIN_MAX_PERMIT_ROWS;

/** contracts/search-api.md step 4: the counts run over the full radius-matching set and `limit`
 *  applies only to the returned page. With the DuckDB adapter all of it happens inside SQL (counts
 *  plus the nearest `limit` rows), so a county-sized radius never reaches JavaScript; a test
 *  double without `searchPropertiesPage` takes the legacy in-memory path below. */
export async function searchProperties(
  leadIndex: LeadIndex,
  input: SearchPropertiesInput,
): Promise<SearchPropertiesResult> {
  const { manifestCid } = await leadIndex.indexInfo();
  const limit = Math.min(input.limit ?? MAX_PROPERTY_ROWS, MAX_PROPERTY_ROWS);
  // T043 (B-09/US2): ownerAreaClass/tenureYearsMin are additional filters over the same
  // radius-matching set, applied together with roofAgeMinYears in one query — never a
  // separately-derived radius (SC-06's same rule, extended to these two new filters).
  // Conditional spreads, not literal `field: input.field` — exactOptionalPropertyTypes forbids
  // assigning an explicit `| undefined` to SearchPropertiesQuery's plain-optional fields.
  const filters = {
    ...(input.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: input.roofAgeMinYears }),
    ...(input.ownerAreaClass !== undefined
      ? { ownerAreaClass: input.ownerAreaClass }
      : input.outOfArea === true
        ? { ownerAreaClass: ["regional", "out_of_area"] }
        : {}),
    ...(input.tenureYearsMin === undefined ? {} : { tenureYearsMin: input.tenureYearsMin }),
    ...(input.permitStatusClass === undefined
      ? {}
      : { permitStatusClass: input.permitStatusClass }),
    ...(input.permitOpenDaysMin === undefined
      ? {}
      : { permitOpenDaysMin: input.permitOpenDaysMin }),
  };

  if (leadIndex.searchPropertiesPage !== undefined) {
    const page = await leadIndex.searchPropertiesPage({
      center: input.center,
      radiusMi: input.radiusMi,
      limit,
      ...filters,
    });
    return {
      properties: page.rows,
      counts: {
        afterRadius: page.afterRadius,
        afterRoofAge: page.afterFilters,
        excludedNoRoofDate: input.roofAgeMinYears === undefined ? 0 : page.noRoofDate,
        excludedNoTenure: input.tenureYearsMin === undefined ? 0 : page.noTenure,
      },
      manifestCid,
    };
  }

  const afterRadius = await leadIndex.searchProperties({
    center: input.center,
    radiusMi: input.radiusMi,
  });
  const hasFilter = Object.keys(filters).length > 0;
  const afterRoofAge = !hasFilter
    ? afterRadius
    : await leadIndex.searchProperties({
        center: input.center,
        radiusMi: input.radiusMi,
        ...filters,
      });

  return {
    properties: afterRoofAge.slice(0, limit),
    counts: {
      afterRadius: afterRadius.length,
      afterRoofAge: afterRoofAge.length,
      excludedNoRoofDate:
        input.roofAgeMinYears === undefined
          ? 0
          : afterRadius.filter((p) => p.roofAgeYears === null).length,
      excludedNoTenure:
        input.tenureYearsMin === undefined
          ? 0
          : afterRadius.filter((p) => p.tenureYears == null).length,
    },
    manifestCid,
  };
}

export interface SearchPermitsInput {
  /** Scope of a radius search; ignored when `permitNumber` is given (an exact lookup). */
  center: SearchCenter;
  radiusMi: number;
  /** T044 (B-09/US2, G5): exact permit-number lookup. It reads `crm_permit` by that key alone and
   *  ignores the radius entirely (the permit number is the scope), so it costs the same wherever
   *  the permit sits. */
  permitNumber?: string | undefined;
  /** Keep only these `statusClass` values (SQL filter). */
  statusClass?: readonly string[] | undefined;
  /** Keep only permits open at least this many days (SQL filter). */
  openDaysMin?: number | undefined;
  /** Page size, clamped to `MAX_PERMIT_ROWS`. */
  limit?: number | undefined;
}

export interface SearchPermitsResult {
  permits: (PermitResult & { isLongOpen: boolean })[];
  /** Exact number of matching permits, before the page limit. */
  total: number;
  /** True when `total` exceeds the rows returned. */
  truncated: boolean;
  manifestCid: string;
}

/** contracts/search-api.md step 2: the permits of the properties inside the exact circle, longest
 *  open first. With the DuckDB adapter the join to `crm_property` (bbox plus exact distance), the
 *  status / open-days filters, the sort, the page and the total all run in one SQL statement — the
 *  list of properties in the radius is never built in JavaScript and no `IN (...)` list is sent
 *  (GAP-1). Attaches `isLongOpen` (packages/domain) as a display-layer flag, never stored. */
export async function searchPermits(
  leadIndex: LeadIndex,
  input: SearchPermitsInput,
): Promise<SearchPermitsResult> {
  const { manifestCid } = await leadIndex.indexInfo();
  const limit = Math.min(Math.max(1, input.limit ?? MAX_PERMIT_ROWS), MAX_PERMIT_ROWS);
  const lookup = input.permitNumber !== undefined;
  const common = {
    ...(lookup ? { permitNumber: input.permitNumber as string } : {}),
    ...(input.statusClass === undefined ? {} : { statusClass: input.statusClass }),
    ...(input.openDaysMin === undefined ? {} : { openDaysMinimum: input.openDaysMin }),
    sort: "openDays" as const,
  };

  let rows: PermitResult[];
  let total: number;
  if (leadIndex.searchPermitsPage !== undefined) {
    const page = await leadIndex.searchPermitsPage({
      ...common,
      ...(lookup ? {} : { center: input.center, radiusMi: input.radiusMi }),
      limit,
    });
    rows = page.rows;
    total = page.total;
  } else {
    // Test doubles only: the legacy two-step join through the radius property set.
    const propertyCids = lookup
      ? undefined
      : (await leadIndex.searchProperties({ center: input.center, radiusMi: input.radiusMi })).map(
          (p) => p.propertyCid,
        );
    let all = await leadIndex.searchPermits({
      ...common,
      ...(propertyCids === undefined ? {} : { propertyCids }),
    });
    if (input.statusClass !== undefined) {
      const allowed = new Set<string>(input.statusClass);
      // open and stalled are live classes: a permit with a final date is finished (isLivePermit).
      all = all.filter(
        (p) =>
          p.statusClass !== null &&
          allowed.has(p.statusClass) &&
          (p.statusClass === "closed" || isLivePermit(p)),
      );
    }
    if (input.openDaysMin !== undefined) {
      const minDays = input.openDaysMin;
      all = all.filter((p) => (p.openDays ?? -1) >= minDays);
    }
    total = all.length;
    rows = all.slice(0, limit);
  }

  return {
    permits: rows.map((permit) => ({ ...permit, isLongOpen: isLongOpen(permit.openDays) })),
    total,
    truncated: total > rows.length,
    manifestCid,
  };
}

/** Thrown when the wired `LeadIndex` has no `countyOverview` (only a test double can lack it). */
export class CountyOverviewUnavailableError extends Error {
  readonly code = "COUNTY_OVERVIEW_UNAVAILABLE" as const;
  constructor() {
    super("LeadIndex: this index does not serve the county overview");
  }
}

export interface CountyOverviewInput {
  zoom: number;
  // `| undefined` for the same exactOptionalPropertyTypes reason as SearchPropertiesInput.
  roofAgeMinYears?: number | undefined;
  propertyUsageType?: string | undefined;
  permits?: boolean | undefined;
  permitStatus?: "open" | "stalled" | undefined;
  permitOpenDaysMin?: number | undefined;
}

/** search.countyOverview (design-review-log row 10): the whole-county hexagon aggregate for the
 *  map's zoomed-out view. The aggregation and its sandbox cache live in the adapter; this only
 *  drops unset filters (so the cache key and the SQL never see an explicit `undefined`). */
export async function countyOverview(
  leadIndex: LeadIndex,
  input: CountyOverviewInput,
): Promise<CountyOverview> {
  if (leadIndex.countyOverview === undefined) throw new CountyOverviewUnavailableError();
  const query: CountyOverviewQuery = {
    zoom: input.zoom,
    ...(input.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: input.roofAgeMinYears }),
    ...(input.propertyUsageType === undefined
      ? {}
      : { propertyUsageType: input.propertyUsageType }),
    ...(input.permits === undefined ? {} : { permits: input.permits }),
    ...(input.permitStatus === undefined ? {} : { permitStatus: input.permitStatus }),
    ...(input.permitOpenDaysMin === undefined
      ? {}
      : { permitOpenDaysMin: input.permitOpenDaysMin }),
  };
  return leadIndex.countyOverview(query);
}

/** Similar properties: within this radius and this many years of the property's roof age. */
export const SIMILAR_RADIUS_MI = 1;
export const SIMILAR_ROOF_AGE_BAND_YEARS = 5;

export type SimilarReason = "no_coordinates" | "no_roof_age" | "none_found";

export interface SimilarPropertiesResult {
  /** False when the property is not in the promoted run. */
  found: boolean;
  similar: SimilarPropertyRow[];
  /** Why the list is empty; null when it has rows. */
  reason: SimilarReason | null;
}

export class SimilarUnavailableError extends Error {
  constructor() {
    super("similar properties are not available on this index");
    this.name = "SimilarUnavailableError";
  }
}

export async function similarProperties(
  leadIndex: LeadIndex,
  input: { propertyCid: string; limit: number },
): Promise<SimilarPropertiesResult> {
  if (leadIndex.similarProperties === undefined) throw new SimilarUnavailableError();
  const property = await leadIndex.getProperty(input.propertyCid);
  if (property === null) return { found: false, similar: [], reason: "none_found" };
  if (property.latitude === null || property.longitude === null) {
    return { found: true, similar: [], reason: "no_coordinates" };
  }
  if (property.roofAgeYears === null) return { found: true, similar: [], reason: "no_roof_age" };
  const similar = await leadIndex.similarProperties({
    center: { lat: property.latitude, lng: property.longitude },
    radiusMi: SIMILAR_RADIUS_MI,
    propertyType: property.propertyType,
    roofAgeYears: property.roofAgeYears,
    roofAgeBand: SIMILAR_ROOF_AGE_BAND_YEARS,
    excludePropertyCid: property.propertyCid,
    limit: input.limit,
  });
  return { found: true, similar, reason: similar.length === 0 ? "none_found" : null };
}

export type AddressSearchResult =
  | {
      found: true;
      matches: AddressMatch[];
      /** Matches in the run (capped at `ADDRESS_TOTAL_CAP`); may exceed `matches.length`. */
      total: number;
      runId: string | null;
    }
  | { found: false; runId: string | null; reason?: "address_not_in_index" };

/** Exact street-address search. No fuzzy fallback: no match is `found: false` with the run id; an
 *  index built before Run 3.1 (no `unnormalizedAddress` column) says `address_not_in_index`. */
export async function searchByAddress(
  leadIndex: LeadIndex,
  input: { value: string; limit: number },
): Promise<AddressSearchResult> {
  const runId = (await leadIndex.currentRunId()) ?? null;
  const page = leadIndex.searchByAddress
    ? await leadIndex.searchByAddress(input)
    : ({ indexed: false } as const);
  if (!page.indexed) return { found: false, runId, reason: "address_not_in_index" };
  if (page.rows.length === 0) return { found: false, runId };
  return { found: true, matches: page.rows, total: page.total, runId };
}
