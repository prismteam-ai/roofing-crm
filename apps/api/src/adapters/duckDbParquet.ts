// LeadIndex port, implemented over S3 Parquet via DuckDB (T026, INDEX group, espeon), per
// contracts/lead-index-port.md and ADR-01 (no OpenSearch domain — this is the only query surface
// in v1). Caches the opened DuckDB connection per-sandbox, per-manifest in module scope — not
// per-request — which is ADR-01's whole cost argument, so it must be visible in code, not just a
// comment (alakazam's consult).
import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { GetCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openParquetConnection, type DuckDBConnection } from "../engine/duckdb.js";
import {
  downloadS3ObjectToFile,
  METRIC_NAMES,
  withObservabilityOperation,
  type Observability,
} from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { LIVE_PERMIT_STATUS_CLASSES } from "@crm/shared";
import {
  bboxFor,
  DEFAULT_ROOF_AGE_YEARS,
  EARTH_RADIUS_M,
  MAX_PERMIT_ROWS,
  HEX_RADIUS_PX,
  hexCellCenter,
  hexWorldSize,
  milesToMeters,
  type LatLng,
} from "@crm/domain";

/** Same constant as `@crm/domain`'s `distanceMeters` (3,958.8 mi); pinned by test/search.sql.test.ts
 *  against `distanceMeters` itself so the two cannot drift. */
const EARTH_RADIUS_METERS = EARTH_RADIUS_M;

/** DuckDB's own single-quote escaping (double the quote) — the one rule every string literal
 *  interpolated into a SQL string in this adapter must follow consistently (CR-B-02 finding #4:
 *  `propertyUsageType` already did this; `propertyCid` did not). */
function sqlEscapeString(value: string): string {
  return value.replace(/'/g, "''");
}

export class IndexNotReadyError extends Error {
  readonly code = "INDEX_NOT_READY" as const;
  constructor() {
    super("LeadIndex: no run has ever been promoted");
  }
}

export class IndexColdLoadTimeoutError extends Error {
  readonly code = "INDEX_COLD_LOAD_TIMEOUT" as const;
  constructor(manifestCid: string, timeoutMs: number) {
    super(`LeadIndex: cold load of manifest ${manifestCid} exceeded its ${timeoutMs}ms budget`);
  }
}

/** CR-B-02 finding #8: thrown internally by a cold-load attempt that finishes after a newer
 *  attempt for the same manifestCid has already started (this one lost the race to the timeout).
 *  Never surfaces to a caller of `searchProperties`/`searchPermits`/`getProperty` — it is only
 *  ever observed by `coldLoad`'s own background-rejection handling, exported solely so a test can
 *  assert on it directly rather than only on its side effects. */
export class IndexColdLoadStaleAttemptError extends Error {
  readonly code = "INDEX_COLD_LOAD_STALE_ATTEMPT" as const;
  constructor(manifestCid: string, attemptId: number) {
    super(
      `LeadIndex: cold-load attempt ${attemptId} for manifest ${manifestCid} was superseded by a newer attempt; discarded`,
    );
  }
}

/** Thrown when one index query outlives its per-call budget (DuckDB is interrupted, so the
 *  sandbox's single connection is free again). A bounded, typed failure instead of a Lambda
 *  timeout the caller can only see as "Unable to transform response from server". */
export class IndexQueryBudgetExceededError extends Error {
  readonly code = "INDEX_QUERY_BUDGET_EXCEEDED" as const;
  constructor(budgetMs: number) {
    super(`LeadIndex: query exceeded its ${budgetMs}ms budget and was interrupted`);
  }
}

export interface IndexInfo {
  manifestCid: string;
  propertyCount: number;
  permitCount: number;
  promotedAt: string;
}

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface SearchPropertiesQuery {
  bbox?: BoundingBox;
  /** B-03 (contracts/search-api.md): a center point + radius, converted to `bbox` via
   *  `packages/domain`'s `bboxFor` before the DuckDB bbox filter below, then cut to the exact
   *  circle with `distanceMeters` (ADR-07: the bbox is a superset prefilter, never the final
   *  answer on its own). When both `bbox` and `center`/`radiusMi` are given, `center`/`radiusMi`
   *  wins — the caller picked the real search shape. */
  center?: LatLng;
  radiusMi?: number;
  roofAgeMinYears?: number;
  propertyUsageType?: string;
  /** Permit filter, evaluated in SQL as a semi-join to `crm_permit` BEFORE the limit, the order and
   *  every count: keep a property only if it has a permit with one of these `statusClass` values
   *  (and, with `permitOpenDaysMin`, open at least that many days, on the SAME permit). */
  permitStatusClass?: readonly string[];
  permitOpenDaysMin?: number;
  /** G4 (checks.md §7.1, T043): exact match against the stored `ownerAreaClass` enum
   *  (`in_county|regional|out_of_area|unknown`) — never a second, independently-derived
   *  classification. "Owners outside the area" means `ownerAreaClass IN
   *  ("regional","out_of_area")`; callers pass the exact value(s) they mean, this adapter never
   *  guesses which values "outside" covers. */
  ownerAreaClass?: string | readonly string[];
  /** Owner filter "Tenure >= N years". When the index carries the stored `tenureYears` column the
   *  filter is exact (`"tenureYears" >= N`; rows with no tenure are excluded and counted in
   *  `PropertiesPage.noTenure`). Older indexes (no such column) fall back to the rule below.
   *  G4 (T043): the older index's only tenure granularity is the boolean
   *  `isLongTenure` (`tenure_years > 10`, packages/oracle-views/src/derive.ts) — the raw
   *  `tenure_years` count is deliberately not carried into this table (data-model.md,
   *  mapPropertyRow's comment in apps/sync/handlers/buildIndex.ts). So `tenureYearsMin` is
   *  honored only at that one fixed cutoff: any value <= 10 is answered exactly by
   *  `isLongTenure = TRUE` (every long-tenure row owned for *more* than 10 years necessarily
   *  satisfies a "at least N years" threshold for any N <= 10); a value above 10 cannot be
   *  verified more precisely than that with the data this index has, so it is still answered
   *  with `isLongTenure = TRUE` as the closest available (conservative, documented) match rather
   *  than silently ignored or guessed at a finer grain. */
  tenureYearsMin?: number;
  limit?: number;
}

/** Hard ceiling on rows one call may return (bytes follow: a permit row is about 0.7 KB, so 500
 *  rows stay far below 1 MB). The page `limit` is clamped to this and to at least 1. */
export const MAX_PAGE_ROWS = MAX_PERMIT_ROWS;
/** Page size when a caller gives no `limit`. */
export const DEFAULT_PAGE_ROWS = 100;
/** Per-query wall-clock budget (ms): well inside the 23 s agent abort and the 28 s Lambda. */
export const DEFAULT_QUERY_BUDGET_MS = 10_000;

export interface SearchPermitsQuery {
  propertyCid?: string;
  /** Radius scope, evaluated in SQL as a semi-join to `crm_property` (bbox superset, then the
   *  exact haversine cut that equals `@crm/domain`'s `distanceMeters`). Ignored when
   *  `propertyCid`/`propertyCids` or `permitNumber` is given. */
  center?: LatLng;
  radiusMi?: number;
  /** Exact `statusClass` values to keep (`open|stalled|closed`), in SQL. */
  statusClass?: readonly string[];
  /** Page size; clamped to `MAX_PAGE_ROWS`. Without it the legacy array method returns every
   *  match, so callers on a county-sized scope must always pass one. */
  limit?: number;
  /** B-03 `search.permits` (contracts/search-api.md step 2): joins through the same
   *  radius-filtered property set as `search.properties`, so the two procedures never disagree
   *  on which properties are in scope (SC-06). Ignored when `propertyCid` is also given. */
  propertyCids?: readonly string[];
  /** G5 (checks.md §7.1, T044): exact lookup by the stored `permitNumber` string, independent of
   *  (and combinable with) the propertyCid/propertyCids scoping above — a quote in the value is
   *  escaped the same way every other string filter in this adapter is. */
  permitNumber?: string;
  isOpen?: boolean;
  openDaysMinimum?: number;
  sort?: "openDays" | "issueDate";
}

/** One page of a radius property search plus the exact counts over the whole matching set. */
export interface PropertiesPage {
  rows: PropertyResult[];
  /** Properties inside the exact circle (no other filter). */
  afterRadius: number;
  /** Inside the circle and passing every filter. */
  afterFilters: number;
  /** Inside the circle with no roof date (counted whether or not a roof-age filter was given). */
  noRoofDate: number;
  /** Inside the circle with no tenure (`tenureYears` null; 0 on an index without the column). */
  noTenure: number;
}

/** One street-address match: the address exactly as TCAD prints it, and where the map centres. */
export interface AddressMatch {
  propertyCid: string;
  requestIdentifier: string;
  address: string;
  lat: number;
  lng: number;
}

/** `indexed: false` = the served index predates Run 3.1 and has no `unnormalizedAddress` column. */
export type AddressPage =
  | { indexed: false }
  | { indexed: true; rows: AddressMatch[]; total: number };

/** Most matches counted for `total` (a street line shared by many units stays bounded). */
export const ADDRESS_TOTAL_CAP = 1000;

/**
 * Address normalisation, as one DuckDB expression (the query literal and the stored column go
 * through the SAME expression, so they cannot disagree): uppercase; '#' unit marks become spaces;
 * everything except letters, digits, commas and whitespace is removed; whitespace runs collapse;
 * spaces around commas are tidied to ", "; leading/trailing spaces and commas are trimmed.
 * Nothing else is rewritten: "DR" is not "DRIVE", "N" is not "NORTH" (exact, not fuzzy).
 */
export function normalisedAddressSql(expr: string): string {
  const upper = `replace(upper(${expr}), '#', ' ')`;
  const stripped = `regexp_replace(${upper}, '[^\\p{L}\\p{N},\\s]', '', 'g')`;
  const collapsed = `regexp_replace(${stripped}, '\\s+', ' ', 'g')`;
  const commas = `regexp_replace(${collapsed}, ' ?, ?', ', ', 'g')`;
  return `regexp_replace(${commas}, '^[ ,]+|[ ,]+$', '', 'g')`;
}

export interface PermitsPage {
  rows: PermitResult[];
  /** Exact number of matching permits before the page limit. */
  total: number;
}

/** Which of the caller's own request identifiers pass the leads-list filters. The candidates are
 *  the caller's leads (a few hundred at most); the radius, roof age and permit status are
 *  evaluated in SQL with the same predicates as the map's property and permit searches. */
export interface MatchingRequestIdentifiersQuery {
  requestIdentifiers: readonly string[];
  center?: LatLng;
  radiusMi?: number;
  roofAgeMinYears?: number;
  /** Keep a property only if it has at least one permit with this `statusClass`. */
  permitStatus?: string;
  /** Keep a property only if it has a permit open at least this many days. With `permitStatus`
   *  both must hold on the SAME permit. */
  permitOpenDaysMin?: number;
}

/** Candidate identifiers per statement: keeps the SQL text small for a very long lead list. */
export const MATCHING_IDS_CHUNK = 10_000;

export type SearchPropertiesPageQuery = SearchPropertiesQuery & {
  center: LatLng;
  radiusMi: number;
};

/** "Similar properties" (drawer): same property type, roof age within a band, near a point. */
export interface SimilarPropertiesQuery {
  center: LatLng;
  radiusMi: number;
  /** Exact match; a null type matches only other null types. */
  propertyType: string | null;
  roofAgeYears: number;
  /** Inclusive plus or minus years around `roofAgeYears`. */
  roofAgeBand: number;
  excludePropertyCid: string;
  limit: number;
}

export interface SimilarPropertyRow {
  propertyCid: string;
  requestIdentifier: string;
  distanceMi: number;
  roofAgeYears: number;
  roofAgeConfidence: CrmProperty["roofAgeConfidence"];
  roofAgeBasis: CrmProperty["roofAgeBasis"];
}

export type PropertyResult = Provenanced<CrmProperty>;
export type PermitResult = Provenanced<CrmPermit>;

export interface LeadIndex {
  indexInfo(): Promise<IndexInfo>;
  searchProperties(query: SearchPropertiesQuery): Promise<PropertyResult[]>;
  searchPermits(query: SearchPermitsQuery): Promise<PermitResult[]>;
  /** Bounded radius search: counts in SQL, only `limit` rows fetched (never the whole radius).
   *  Optional on the port so single-purpose test doubles need no stub; the service falls back to
   *  `searchProperties` when an index lacks it. */
  searchPropertiesPage?(query: SearchPropertiesPageQuery): Promise<PropertiesPage>;
  /** Bounded permit search joined to `crm_property` in SQL: one page plus the exact total. */
  searchPermitsPage?(query: SearchPermitsQuery): Promise<PermitsPage>;
  /** Leads-list filters in SQL: the subset of `requestIdentifiers` whose property passes radius,
   *  roof age and permit status (semi-join on `crm_permit`). No property is ever listed in
   *  JavaScript. Optional on the port so single-purpose test doubles need no stub; the lead
   *  service falls back to `searchProperties` + `searchPermits` when an index lacks it. */
  matchingRequestIdentifiers?(query: MatchingRequestIdentifiersQuery): Promise<Set<string>>;
  /** Starts (or joins) the load of the promoted index ahead of any request; resolves when it is
   *  ready. Optional on the port: test doubles need no stub, the warm-up skips an index without it. */
  warm?(): Promise<{ manifestCid: string }>;
  getProperty(propertyCid: string): Promise<(PropertyResult & { permits: PermitResult[] }) | null>;
  /** Bounded nearest-first query for the drawer's "Similar properties". Optional on the port so
   *  test doubles need no stub; the service answers a typed "not implemented" without it. */
  similarProperties?(query: SimilarPropertiesQuery): Promise<SimilarPropertyRow[]>;
  /** One property by its `requestIdentifier` (tcadId) — an indexed `WHERE` filter, not a
   *  full-table scan (CR finding: `services/agent/tools.ts`'s `propertyCidForTcadId` and
   *  `routers/agent.ts`'s `confirmLead` both used to pull the whole table into memory to find one
   *  row). Returns `undefined` when no property in the promoted run has this requestIdentifier. */
  getPropertyByRequestIdentifier(requestIdentifier: string): Promise<PropertyResult | undefined>;
  /** Exact street-address search (search box). A stored address matches when its normalised form
   *  equals the normalised query, or starts with it at a comma boundary (see
   *  `normalisedAddressSql`): so a street line alone matches every city that has it. Optional on
   *  the port so test doubles need no stub; the service then reports the column as absent. */
  searchByAddress?(query: { value: string; limit: number }): Promise<AddressPage>;
  /** Which of these request identifiers exist in the promoted run (AC-5 presence check). */
  presentRequestIdentifiers(ids: readonly string[]): Promise<Set<string>>;
  /** Run identifier (provenance `runId`) of the promoted run; undefined when it has no rows. */
  currentRunId(): Promise<string | undefined>;
  /** Whole-county hexagon aggregate for the map's zoomed-out view (design-review-log row 10).
   *  Optional on the port so the many single-purpose test doubles of `LeadIndex` need not grow
   *  a stub; the service answers a typed "not implemented" when an index lacks it. */
  countyOverview?(query: CountyOverviewQuery): Promise<CountyOverview>;
}

export interface CountyOverviewQuery {
  /** Whole-number map zoom below `HEX_OVERVIEW_MAX_ZOOM`; picks the hexagon size. */
  zoom: number;
  roofAgeMinYears?: number;
  propertyUsageType?: string;
  /** The Layers "Open and stalled permits" switch: add per-cell permit counts. */
  permits?: boolean;
  /** Permit status filter (Filters → Permit status): "open" = open or stalled, "stalled" = stalled
   *  only; unset = open and stalled. */
  permitStatus?: "open" | "stalled";
  /** Permit open at least this many days (Filters → Permit open ≥ N yrs). */
  permitOpenDaysMin?: number;
}

export interface CountyOverviewCell {
  /** Axial cell coordinates on `@crm/domain`'s hex grid at `zoom`. */
  q: number;
  r: number;
  /** Cell centre, rounded to 5 decimals (about 1 m). */
  lat: number;
  lng: number;
  count: number;
  /** Properties in the cell with a published roof age. */
  withRoofAge: number;
  /** Median published roof age, 1 decimal; null when none is published in the cell. */
  medianRoofAge: number | null;
  /** Properties whose roof age is at least `agedYears`. */
  agedCount: number;
  /** Present only when `permits` was asked for. */
  openPermits?: number;
  stalledPermits?: number;
  /** Longest open duration of the counted permits; null when none is counted. */
  maxOpenDays?: number | null;
}

export interface CountyOverview {
  zoom: number;
  agedYears: number;
  cells: CountyOverviewCell[];
  counts: {
    /** Every property in the promoted run. */
    total: number;
    /** Properties that pass the filters. */
    matched: number;
    /** Matched properties drawn in a hexagon. */
    binned: number;
    /** Matched properties not drawn: no published coordinates. */
    excludedNoCoordinates: number;
    /** Properties the roof-age minimum dropped only for having no roof date (0 without one). */
    excludedNoRoofDate: number;
    /** Drawn properties with no published roof age (in the count, not the median). */
    binnedWithoutRoofAge: number;
    /** Counted permits on drawn properties; present only when `permits` was asked for. */
    openPermits?: number;
    stalledPermits?: number;
  };
  manifestCid: string;
  /** Provenance: the promoted run's id; null when the run has no property rows. */
  runId: string | null;
}

/** Per-sandbox overview cache, keyed by manifestCid + normalised filters: the same pattern (and
 *  the same invalidation — a promotion changes the manifestCid) as `sandboxCache` below. Bounded:
 *  the oldest entry is dropped past `OVERVIEW_CACHE_MAX`. */
const overviewCache = new Map<string, Promise<CountyOverview>>();
const OVERVIEW_CACHE_MAX = 64;

function overviewCacheKey(manifestCid: string, query: CountyOverviewQuery): string {
  return JSON.stringify([
    manifestCid,
    Math.floor(query.zoom),
    query.roofAgeMinYears ?? null,
    query.propertyUsageType ?? null,
    query.permits === true,
    query.permits === true ? (query.permitStatus ?? null) : null,
    query.permits === true ? (query.permitOpenDaysMin ?? null) : null,
  ]);
}

const round = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

/** SQL twin of `@crm/domain`'s `hexAxialOf` (projectMercator + hexAxialOfPixel), same operation
 *  order so DuckDB's doubles match JavaScript's; `floor(v + 0.5)` is `Math.round` (half up, also
 *  for negatives, where SQL `round` would go half away from zero). Pinned by
 *  test/countyOverview.test.ts. Reads `lat`/`lng` columns; yields `q`, `r`. */
function hexCellSql(zoom: number, source: string): string {
  const world = hexWorldSize(zoom);
  const size = HEX_RADIUS_PX;
  return `
    proj AS (
      SELECT *, ((lng + 180) / 360) * ${world} AS x,
        (0.5 - ln((1 + sin((lat * pi()) / 180)) / (1 - sin((lat * pi()) / 180))) / (4 * pi())) * ${world} AS y
      FROM ${source}
    ),
    frac AS (
      SELECT *, ((sqrt(3) / 3) * x - y / 3) / ${size} AS qf, ((2.0 / 3.0) * y) / ${size} AS rf FROM proj
    ),
    rounded AS (
      SELECT *, floor(qf + 0.5) AS q0, floor(rf + 0.5) AS r0, floor(-qf - rf + 0.5) AS s0 FROM frac
    ),
    axial AS (
      SELECT *,
        CASE WHEN abs(q0 - qf) > abs(r0 - rf) AND abs(q0 - qf) > abs(s0 - (-qf - rf)) THEN -r0 - s0 ELSE q0 END AS q,
        CASE WHEN abs(q0 - qf) > abs(r0 - rf) AND abs(q0 - qf) > abs(s0 - (-qf - rf)) THEN r0
             WHEN abs(r0 - rf) > abs(s0 - (-qf - rf)) THEN -q0 - s0 ELSE r0 END AS r
      FROM rounded
    )`;
}

/** A number safe to interpolate into SQL: finite, printed the way JavaScript round-trips it. */
function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`LeadIndex: non-finite number in a query`);
  return String(value);
}

/** The radius predicate, in SQL: the `bboxFor` rectangle (a superset the Parquet min/max
 *  statistics can prune on) AND the exact haversine cut that is `@crm/domain`'s `distanceMeters`
 *  `< milesToMeters(radiusMi)` written out term for term (same earth radius, same operation order,
 *  ADR-07). Rows without coordinates never pass (BETWEEN on NULL is NULL). `dist` is the distance
 *  expression, usable as the nearest-first sort key. */
function radiusSql(
  center: LatLng,
  radiusMi: number,
  col: (name: "latitude" | "longitude") => string,
): { where: string; dist: string } {
  const box = bboxFor(center, radiusMi);
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const lat = col("latitude");
  const lng = col("longitude");
  const dLat = `((${lat} - ${sqlNumber(center.lat)}) * pi() / 180)`;
  const dLng = `((${lng} - ${sqlNumber(center.lng)}) * pi() / 180)`;
  const h =
    `(sin(${dLat} / 2) * sin(${dLat} / 2) + ${sqlNumber(Math.cos(toRad(center.lat)))} * ` +
    `cos(${lat} * pi() / 180) * sin(${dLng} / 2) * sin(${dLng} / 2))`;
  const dist = `(${sqlNumber(EARTH_RADIUS_METERS)} * 2 * atan2(sqrt(${h}), sqrt(1 - ${h})))`;
  return {
    where:
      `${lat} BETWEEN ${sqlNumber(box.south)} AND ${sqlNumber(box.north)} ` +
      `AND ${lng} BETWEEN ${sqlNumber(box.west)} AND ${sqlNumber(box.east)} ` +
      `AND ${dist} < ${sqlNumber(milesToMeters(radiusMi))}`,
    dist,
  };
}

/** The non-spatial property filters, shared by the legacy array method and the page method. */
function propertyFilterConditions(query: SearchPropertiesQuery, hasTenureYears: boolean): string[] {
  const conditions: string[] = [];
  if (query.roofAgeMinYears !== undefined)
    conditions.push(`"roofAgeYears" >= ${sqlNumber(query.roofAgeMinYears)}`);
  if (query.propertyUsageType !== undefined) {
    conditions.push(`"propertyUsageType" = '${sqlEscapeString(query.propertyUsageType)}'`);
  }
  if (query.permitStatusClass !== undefined || query.permitOpenDaysMin !== undefined) {
    const permitFilters = permitConditions({
      ...(query.permitStatusClass === undefined ? {} : { statusClass: query.permitStatusClass }),
      ...(query.permitOpenDaysMin === undefined
        ? {}
        : { openDaysMinimum: query.permitOpenDaysMin }),
    });
    conditions.push(
      `"propertyCid" IN (SELECT pm."propertyCid" FROM crm_permit pm WHERE ${permitFilters.join(" AND ")})`,
    );
  }
  if (query.ownerAreaClass !== undefined) {
    const values = Array.isArray(query.ownerAreaClass)
      ? query.ownerAreaClass
      : [query.ownerAreaClass as string];
    conditions.push(
      `"ownerAreaClass" IN (${values.map((v) => `'${sqlEscapeString(v)}'`).join(", ")})`,
    );
  }
  if (query.tenureYearsMin !== undefined) {
    // An index that carries the stored `tenureYears` is filtered exactly (NULL tenure never
    // passes a `>=`). An older index has only the boolean `isLongTenure`, so every value is
    // answered at that one fixed (>10 years) cutoff, as before.
    conditions.push(
      hasTenureYears
        ? `"tenureYears" >= ${sqlNumber(query.tenureYearsMin)}`
        : `"isLongTenure" = TRUE`,
    );
  }
  return conditions;
}

function pageLimit(limit: number | undefined): number {
  const n = limit === undefined ? DEFAULT_PAGE_ROWS : Math.floor(limit);
  return Math.min(MAX_PAGE_ROWS, Math.max(1, n));
}

/** SQL for "this permit has no final date" (alias `pm`): part of the live-permit rule. */
const NOT_FINALED_SQL = `pm."finalDate" IS NULL`;

/** WHERE conditions for a permit query (alias `pm`), the radius scope as a semi-join to
 *  `crm_property` evaluated inside DuckDB: no property list ever reaches JavaScript and no giant
 *  `IN (...)` list is built. A `permitNumber` lookup is exact and ignores the radius entirely. */
function permitConditions(query: SearchPermitsQuery): string[] {
  const conditions: string[] = [];
  if (query.permitNumber !== undefined) {
    conditions.push(`pm."permitNumber" = '${sqlEscapeString(query.permitNumber)}'`);
  }
  if (query.propertyCid !== undefined) {
    conditions.push(`pm."propertyCid" = '${sqlEscapeString(query.propertyCid)}'`);
  } else if (query.propertyCids !== undefined) {
    const cids = query.propertyCids;
    conditions.push(
      cids.length === 0
        ? "FALSE"
        : `pm."propertyCid" IN (${cids.map((cid) => `'${sqlEscapeString(cid)}'`).join(", ")})`,
    );
  } else if (
    query.permitNumber === undefined &&
    query.center !== undefined &&
    query.radiusMi !== undefined
  ) {
    const { where } = radiusSql(query.center, query.radiusMi, (n) => `p."${n}"`);
    conditions.push(
      `pm."propertyCid" IN (SELECT p."propertyCid" FROM crm_property p WHERE ${where})`,
    );
  }
  // statusClass/isOpen are read verbatim from the vendored query-core derivation — never
  // recomputed here (contracts/lead-index-port.md).
  // A permit is live (open or stalled) only if it has no final date: Task A classes a finaled
  // permit with no status as "stalled", so a status filter on open/stalled also requires
  // `finalDate IS NULL` (the same rule as `isLivePermit` in @crm/shared).
  if (query.isOpen !== undefined)
    conditions.push(
      query.isOpen
        ? `(pm."statusClass" = 'open' AND ${NOT_FINALED_SQL})`
        : `NOT (pm."statusClass" = 'open' AND ${NOT_FINALED_SQL})`,
    );
  if (query.statusClass !== undefined) {
    conditions.push(
      query.statusClass.length === 0
        ? "FALSE"
        : `(${query.statusClass
            .map((v) =>
              v === "open" || v === "stalled"
                ? `(pm."statusClass" = '${v}' AND ${NOT_FINALED_SQL})`
                : `pm."statusClass" = '${sqlEscapeString(v)}'`,
            )
            .join(" OR ")})`,
    );
  }
  if (query.openDaysMinimum !== undefined)
    conditions.push(`pm."openDays" >= ${sqlNumber(query.openDaysMinimum)}`);
  return conditions;
}

function permitOrderBy(query: SearchPermitsQuery): string {
  // AC-5/data-model.md: longest-open first, nulls (not open) last, pinned explicitly because
  // DuckDB's default NULL order is engine-dependent; permitCid makes pages deterministic.
  return query.sort === "issueDate"
    ? `ORDER BY pm."issueDate" NULLS LAST, pm."permitCid"`
    : `ORDER BY pm."openDays" DESC NULLS LAST, pm."permitCid"`;
}

interface BoundIndex {
  connection: DuckDBConnection;
}

/** Per-sandbox, per-manifest cache: one open DuckDB connection per manifestCid, reused across
 *  every request this Lambda sandbox serves — never re-downloaded or re-opened per request. This
 *  is ADR-01's entire cost argument, so it is a real module-level cache, not an in-request one. */
const sandboxCache = new Map<string, Promise<BoundIndex>>();

export interface DuckDbParquetDeps {
  ddb: DynamoDBDocumentClient;
  s3?: S3Client;
  tableName: string;
  bucket: string;
  obs: Observability;
  /** Default 3s per architecture-constitution.md §10's index-cold-load NFR. This is the most a
   *  request waits for the index before the typed "warming up" error. */
  coldLoadTimeoutMs?: number;
  /** Budget of a load started by `warm()` (module init or the keep-warm ping), where no request
   *  is waiting: the load itself may take this long (default 20 s, inside the 28 s Lambda). */
  warmTimeoutMs?: number;
  tmpDir?: string;
  /** Per-query budget in ms (default `DEFAULT_QUERY_BUDGET_MS`). */
  queryBudgetMs?: number;
}

const DEFAULT_COLD_LOAD_TIMEOUT_MS = 3_000;
const DEFAULT_WARM_TIMEOUT_MS = 20_000;
const PK = "META#index";
/** crm-leads has a pk+sk key (B-07); the pointer item lives at sk "META". */
const SK = "META";

export class DuckDbParquetLeadIndex implements LeadIndex {
  private readonly ddb: DynamoDBDocumentClient;
  private readonly s3: S3Client;
  private readonly tableName: string;
  private readonly bucket: string;
  private readonly obs: Observability;
  private readonly coldLoadTimeoutMs: number;
  private readonly warmTimeoutMs: number;
  private readonly tmpDir: string;
  private readonly queryBudgetMs: number;
  /** CR-B-02 finding #8: one monotonically increasing attempt id per manifestCid. A timed-out
   *  `coldLoad` never cancels the in-flight `load()` it raced against (Promise.race doesn't
   *  cancel its loser) — without this, that abandoned load could still be mid-write to the same
   *  on-disk path a later retry for the same manifestCid also uses, corrupting it. Each attempt
   *  gets its own directory keyed by this counter, and an attempt that resolves after a newer one
   *  has already started is recognized as stale and discarded instead of being returned or left
   *  to linger. */
  private readonly loadAttemptCounter = new Map<string, number>();

  constructor(deps: DuckDbParquetDeps) {
    this.ddb = deps.ddb;
    this.s3 = deps.s3 ?? new S3Client({});
    this.tableName = deps.tableName;
    this.bucket = deps.bucket;
    this.obs = deps.obs;
    this.coldLoadTimeoutMs = deps.coldLoadTimeoutMs ?? DEFAULT_COLD_LOAD_TIMEOUT_MS;
    this.warmTimeoutMs = deps.warmTimeoutMs ?? DEFAULT_WARM_TIMEOUT_MS;
    this.tmpDir = deps.tmpDir ?? "/tmp/crm-index";
    this.queryBudgetMs = deps.queryBudgetMs ?? DEFAULT_QUERY_BUDGET_MS;
  }

  /** Runs one query under the per-call budget: past it DuckDB is interrupted and a typed error
   *  is thrown, so a runaway query can never hold the connection until the Lambda times out. */
  private async runBounded(connection: DuckDBConnection, sql: string) {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      connection.interrupt();
    }, this.queryBudgetMs);
    try {
      return await connection.runAndReadAll(sql);
    } catch (error) {
      if (expired) throw new IndexQueryBudgetExceededError(this.queryBudgetMs);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  // T048 (Phase 6 convergence, CRITICAL): every public LeadIndex method is wrapped with the
  // shared Powertools observability middleware (constitution Article VIII), reusing
  // `withObservabilityOperation` from `packages/observability` rather than hand-rolling
  // Logger/Tracer/Metrics calls here. This port is not itself a Lambda handler entry point (its
  // caller constructs one `Observability` per invocation and injects it via `deps.obs`), so it
  // uses the instrument-in-place form rather than `withObservability` (which always constructs
  // its own fresh Observability — correct for a handler, wrong for a reused, caller-owned one).
  async indexInfo(): Promise<IndexInfo> {
    return withObservabilityOperation(this.obs, "LeadIndex.indexInfo", async () => {
      // crm-leads is B-07's table (architecture-constitution.md §9) — this adapter only ever
      // references it by name, never creates it. In any environment where B-07 hasn't deployed
      // yet, this GetCommand throws ResourceNotFoundException instead of returning an empty
      // Item; found live on the hosted B-03 preview (500, not the typed INDEX_NOT_READY state)
      // before this fix. Same remedy as apps/sync/handlers/validate.ts's identical case: treated
      // as "no run has ever been promoted," not a crash.
      let item;
      try {
        item = await this.ddb.send(
          new GetCommand({ TableName: this.tableName, Key: { pk: PK, sk: SK } }),
        );
      } catch (error) {
        if (error instanceof ResourceNotFoundException) throw new IndexNotReadyError();
        throw error;
      }
      const current = item.Item?.current as string | undefined;
      // Never returns a run whose Validate step has not passed (constitution P0-3): the pointer
      // only ever names a Promoted run, so its mere presence is the readiness signal.
      if (current === undefined) throw new IndexNotReadyError();
      return {
        manifestCid: current,
        propertyCount: Number(item.Item?.propertyCount ?? 0),
        permitCount: Number(item.Item?.permitCount ?? 0),
        promotedAt: String(item.Item?.promotedAt ?? ""),
      };
    });
  }

  /** Starts loading the promoted index ahead of any request (Lambda init phase, which has full
   *  CPU) and by the keep-warm ping. The in-flight promise is the one `ensureLoaded` hands to
   *  requests, so a request arriving mid-load awaits it instead of starting a second download.
   *  Resolves once the index is loaded; a rejection (no promoted run, S3 error, warm budget) is the
   *  caller's to swallow: a failed load is not cached, so the next request just loads normally. */
  async warm(): Promise<{ manifestCid: string }> {
    const { manifestCid } = await this.indexInfo();
    await this.ensureLoaded(manifestCid, { warm: true });
    return { manifestCid };
  }

  /** Downloads and opens this manifest's Parquet once per sandbox, caching the open connection.
   *  A cache hit never re-downloads or re-emits IndexColdLoadMs — only a genuine cold load does.
   *  A request that finds a load already in flight (started by `warm()`) waits for it only up to
   *  its own cold-load budget; past that it gets IndexColdLoadTimeoutError and the load carries on. */
  private async ensureLoaded(
    manifestCid: string,
    options: { warm?: boolean } = {},
  ): Promise<BoundIndex> {
    const cached = sandboxCache.get(manifestCid);
    if (cached !== undefined) {
      return options.warm === true ? cached : this.withinRequestBudget(cached, manifestCid);
    }

    const loadPromise = this.coldLoad(
      manifestCid,
      options.warm === true ? this.warmTimeoutMs : this.coldLoadTimeoutMs,
    );
    sandboxCache.set(manifestCid, loadPromise);
    loadPromise.catch(() => {
      if (sandboxCache.get(manifestCid) === loadPromise) sandboxCache.delete(manifestCid);
    });
    return loadPromise;
  }

  /** Waits for an in-flight load at most `coldLoadTimeoutMs`, without cancelling it. */
  private async withinRequestBudget(
    load: Promise<BoundIndex>,
    manifestCid: string,
  ): Promise<BoundIndex> {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new IndexColdLoadTimeoutError(manifestCid, this.coldLoadTimeoutMs)),
        this.coldLoadTimeoutMs,
      );
    });
    try {
      return await Promise.race([load, budget]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async coldLoad(manifestCid: string, budgetMs: number): Promise<BoundIndex> {
    // This attempt's own generation number. A later ensureLoaded() call for the same manifestCid
    // (e.g. a retry after this attempt times out) bumps the counter again, so this value is only
    // ever "current" until a newer attempt starts.
    const attemptId = (this.loadAttemptCounter.get(manifestCid) ?? 0) + 1;
    this.loadAttemptCounter.set(manifestCid, attemptId);

    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new IndexColdLoadTimeoutError(manifestCid, budgetMs)),
        budgetMs,
      );
    });

    // Keyed by attemptId, not just manifestCid: an abandoned load (the Promise.race loser) keeps
    // running after the timeout rejects, so its writes must never land in the same directory a
    // later, newer attempt for this manifestCid also writes to.
    const dir = join(this.tmpDir, manifestCid, String(attemptId));

    const load = async (): Promise<BoundIndex> => {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const propertyFile = join(dir, "crm_property.parquet");
      const permitFile = join(dir, "crm_permit.parquet");
      await this.downloadToFile(`index/${manifestCid}/crm_property.parquet`, propertyFile);
      await this.downloadToFile(`index/${manifestCid}/crm_permit.parquet`, permitFile);

      const connection = await openParquetConnection(propertyFile, permitFile);
      // DuckDB sizes its buffer pool from the host's RAM, which on Lambda is far above the
      // function's own memory: cap it at 60 percent of the configured size and let it spill to
      // /tmp, so a heavy query fails (or spills) inside DuckDB instead of the runtime being killed
      // with Runtime.OutOfMemory (GAP-1).
      const lambdaMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
      if (Number.isFinite(lambdaMb) && lambdaMb > 0) {
        await connection.run(`SET memory_limit='${Math.floor(lambdaMb * 0.6)}MB'`);
        await connection.run(`SET temp_directory='${sqlEscapeString(join(dir, "spill"))}'`);
      }

      // This attempt lost the race to the timeout (a newer attemptId was already recorded while
      // this load() was still in flight) — never return or cache a stale connection; close it and
      // clean up its own (uniquely keyed) directory instead.
      if (this.loadAttemptCounter.get(manifestCid) !== attemptId) {
        connection.closeSync();
        rmSync(dir, { recursive: true, force: true });
        throw new IndexColdLoadStaleAttemptError(manifestCid, attemptId);
      }
      return { connection };
    };

    const loadPromise = load();
    // Prevents an unhandled-rejection warning/crash: when `timeout` wins the race below, nothing
    // else is awaiting `loadPromise` directly any more, but it keeps running and will eventually
    // settle on its own (successfully, as a stale attempt it self-discards, or with a real
    // error). Promise.race still observes this same promise's original settlement for its own
    // purposes; this just stops the abandoned branch from going unhandled.
    loadPromise.catch(() => undefined);

    let bound: BoundIndex;
    try {
      bound = await Promise.race([loadPromise, timeout]);
    } finally {
      clearTimeout(timer);
    }
    this.obs.metrics.addMetric(
      METRIC_NAMES.IndexColdLoadMs,
      MetricUnit.Milliseconds,
      Date.now() - startedAt,
    );
    return bound;
  }

  private async downloadToFile(key: string, destPath: string): Promise<void> {
    await downloadS3ObjectToFile(this.s3, this.bucket, key, destPath);
  }

  /** Whether this index carries the stored `tenureYears` column (cached per manifest). */
  private readonly tenureColumn = new Map<string, boolean>();
  private async hasTenureColumn(
    connection: DuckDBConnection,
    manifestCid: string,
  ): Promise<boolean> {
    const known = this.tenureColumn.get(manifestCid);
    if (known !== undefined) return known;
    const reader = await this.runBounded(
      connection,
      `SELECT count(*)::INTEGER AS n FROM information_schema.columns
       WHERE table_name = 'crm_property' AND column_name = 'tenureYears'`,
    );
    const n = (reader.getRowObjectsJS()[0] as unknown as { n: number }).n;
    this.tenureColumn.set(manifestCid, n > 0);
    return n > 0;
  }

  /** Whether this index carries the stored `unnormalizedAddress` column (cached per manifest). */
  private readonly addressColumn = new Map<string, boolean>();
  private async hasAddressColumn(
    connection: DuckDBConnection,
    manifestCid: string,
  ): Promise<boolean> {
    const known = this.addressColumn.get(manifestCid);
    if (known !== undefined) return known;
    const reader = await this.runBounded(
      connection,
      `SELECT count(*)::INTEGER AS n FROM information_schema.columns
       WHERE table_name = 'crm_property' AND column_name = 'unnormalizedAddress'`,
    );
    const n = (reader.getRowObjectsJS()[0] as unknown as { n: number }).n;
    this.addressColumn.set(manifestCid, n > 0);
    return n > 0;
  }

  async searchByAddress(query: { value: string; limit: number }): Promise<AddressPage> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchByAddress", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      if (!(await this.hasAddressColumn(connection, manifestCid))) return { indexed: false };
      const limit = Math.min(10, Math.max(1, Math.floor(query.limit)));
      // Cheap pre-filter: when the query opens with a house number, only rows whose raw address
      // starts with those digits are normalised (a plain prefix test, not a regexp over every
      // row). A stored address with leading punctuation before its number would be skipped.
      const house = /^\s*(\d+)\s/.exec(query.value)?.[1];
      const prefilter =
        house === undefined ? "" : `AND starts_with(ltrim("unnormalizedAddress"), '${house}')`;
      const reader = await this.runBounded(
        connection,
        `WITH q AS (SELECT ${normalisedAddressSql(`'${sqlEscapeString(query.value)}'`)} AS v),
         cand AS (
           SELECT "propertyCid", "requestIdentifier", "unnormalizedAddress" AS address,
                  "latitude" AS lat, "longitude" AS lng,
                  ${normalisedAddressSql(`"unnormalizedAddress"`)} AS n
           FROM crm_property
           WHERE "unnormalizedAddress" IS NOT NULL AND "latitude" IS NOT NULL
             AND "longitude" IS NOT NULL ${prefilter}
         )
         SELECT cand."propertyCid", cand."requestIdentifier", cand.address, cand.lat, cand.lng,
                (count(*) OVER ())::INTEGER AS "__total"
         FROM cand, q
         WHERE q.v <> '' AND (cand.n = q.v OR starts_with(cand.n, q.v || ', '))
         ORDER BY cand.address, cand."requestIdentifier"
         LIMIT ${String(limit)}`,
      );
      const raw = reader.getRowObjectsJS() as unknown as (AddressMatch & { __total: number })[];
      const total = Math.min(raw[0]?.__total ?? 0, ADDRESS_TOTAL_CAP);
      const rows = raw.map(({ __total: _t, ...row }) => row);
      return { indexed: true, rows, total };
    });
  }

  async searchProperties(query: SearchPropertiesQuery): Promise<PropertyResult[]> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchProperties", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const conditions: string[] = [];
      let order = "";
      // Center/radius wins over an explicit bbox (contracts/search-api.md step 1). The exact
      // circle cut and the nearest-first sort now run inside DuckDB (radiusSql), so a caller that
      // gives a `limit` fetches only that many rows instead of the whole radius.
      if (query.center && query.radiusMi !== undefined) {
        const { where, dist } = radiusSql(query.center, query.radiusMi, (n) => `"${n}"`);
        conditions.push(where);
        order = ` ORDER BY ${dist}, "propertyCid"`;
      } else if (query.bbox) {
        const box = query.bbox;
        conditions.push(
          `latitude BETWEEN ${sqlNumber(box.south)} AND ${sqlNumber(box.north)} AND longitude BETWEEN ${sqlNumber(box.west)} AND ${sqlNumber(box.east)}`,
        );
      }
      conditions.push(
        ...propertyFilterConditions(
          query,
          query.tenureYearsMin !== undefined &&
            (await this.hasTenureColumn(connection, manifestCid)),
        ),
      );
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit =
        query.limit !== undefined
          ? ` LIMIT ${String(Math.max(0, Math.floor(query.limit)))}`
          : query.center && query.radiusMi !== undefined
            ? ""
            : ` LIMIT ${String(DEFAULT_PAGE_ROWS)}`;
      const reader = await this.runBounded(
        connection,
        `SELECT * FROM crm_property ${where}${order}${limit}`,
      );
      return reader.getRowObjectsJS() as unknown as PropertyResult[];
    });
  }

  /** Radius property search for the API and the agent: three exact counts over the whole circle and
   *  one page of at most `limit` rows, all computed in DuckDB. Counts keep today's definitions:
   *  `afterRadius` has no other filter, `afterFilters` has all of them, `noRoofDate` is the
   *  circle's rows with a null `roofAgeYears`. */
  async searchPropertiesPage(query: SearchPropertiesPageQuery): Promise<PropertiesPage> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchPropertiesPage", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const { where, dist } = radiusSql(query.center, query.radiusMi, (n) => `"${n}"`);
      const hasTenure =
        query.tenureYearsMin !== undefined && (await this.hasTenureColumn(connection, manifestCid));
      const filters = propertyFilterConditions(query, hasTenure);
      const filterSql = filters.length === 0 ? "TRUE" : filters.map((f) => `(${f})`).join(" AND ");
      const countsReader = await this.runBounded(
        connection,
        `SELECT count(*)::INTEGER AS "afterRadius",
           (count(*) FILTER (WHERE ${filterSql}))::INTEGER AS "afterFilters",
           (count(*) FILTER (WHERE "roofAgeYears" IS NULL))::INTEGER AS "noRoofDate",
           (count(*) FILTER (WHERE ${hasTenure ? `"tenureYears" IS NULL` : "FALSE"}))::INTEGER AS "noTenure"
         FROM crm_property WHERE ${where}`,
      );
      const counts = countsReader.getRowObjectsJS()[0] as unknown as {
        afterRadius: number;
        afterFilters: number;
        noRoofDate: number;
        noTenure: number;
      };
      let rows: PropertyResult[] = [];
      if (counts.afterFilters > 0) {
        const pageReader = await this.runBounded(
          connection,
          `SELECT * FROM crm_property WHERE ${where} AND ${filterSql}
           ORDER BY ${dist}, "propertyCid" LIMIT ${String(pageLimit(query.limit))}`,
        );
        rows = pageReader.getRowObjectsJS() as unknown as PropertyResult[];
      }
      return { rows, ...counts };
    });
  }

  /** Leads-list filter pushdown: one statement per chunk of candidates, a semi-join to
   *  `crm_permit` for the permit status, the same bbox + haversine cut as `searchProperties`.
   *  Returns at most the candidates themselves, so the response is bounded by the caller's leads. */
  async matchingRequestIdentifiers(query: MatchingRequestIdentifiersQuery): Promise<Set<string>> {
    const ids = [...new Set(query.requestIdentifiers)];
    if (ids.length === 0) return new Set();
    return withObservabilityOperation(
      this.obs,
      "LeadIndex.matchingRequestIdentifiers",
      async () => {
        const { manifestCid } = await this.indexInfo();
        const { connection } = await this.ensureLoaded(manifestCid);
        const filters: string[] = [];
        if (query.center !== undefined && query.radiusMi !== undefined) {
          filters.push(radiusSql(query.center, query.radiusMi, (n) => `p."${n}"`).where);
        }
        if (query.roofAgeMinYears !== undefined)
          filters.push(`p."roofAgeYears" >= ${sqlNumber(query.roofAgeMinYears)}`);
        if (query.permitStatus !== undefined || query.permitOpenDaysMin !== undefined) {
          // Same predicates as the permit search (permitConditions), joined to the property.
          const permitFilters = permitConditions({
            // "open" includes stalled, the same definition as the map filter (isLivePermit).
            ...(query.permitStatus === undefined
              ? {}
              : {
                  statusClass:
                    query.permitStatus === "open"
                      ? [...LIVE_PERMIT_STATUS_CLASSES]
                      : [query.permitStatus],
                }),
            ...(query.permitOpenDaysMin === undefined
              ? {}
              : { openDaysMinimum: query.permitOpenDaysMin }),
          });
          filters.push(
            `EXISTS (SELECT 1 FROM crm_permit pm WHERE pm."propertyCid" = p."propertyCid" ` +
              `AND ${permitFilters.join(" AND ")})`,
          );
        }
        const extra = filters.length === 0 ? "" : ` AND ${filters.join(" AND ")}`;
        const found = new Set<string>();
        for (let at = 0; at < ids.length; at += MATCHING_IDS_CHUNK) {
          const list = ids
            .slice(at, at + MATCHING_IDS_CHUNK)
            .map((id) => `'${sqlEscapeString(id)}'`)
            .join(", ");
          const reader = await this.runBounded(
            connection,
            `SELECT DISTINCT p."requestIdentifier" FROM crm_property p
           WHERE p."requestIdentifier" IN (${list})${extra}`,
          );
          for (const row of reader.getRowObjectsJS() as unknown as { requestIdentifier: string }[])
            found.add(row.requestIdentifier);
        }
        return found;
      },
    );
  }

  async searchPermits(query: SearchPermitsQuery): Promise<PermitResult[]> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchPermits", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const conditions = permitConditions(query);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit =
        query.limit === undefined ? "" : ` LIMIT ${String(Math.max(0, Math.floor(query.limit)))}`;
      const reader = await this.runBounded(
        connection,
        `SELECT pm.* FROM crm_permit pm ${where} ${permitOrderBy(query)}${limit}`,
      );
      return reader.getRowObjectsJS() as unknown as PermitResult[];
    });
  }

  /** One page of permits (at most `limit`, never more than `MAX_PAGE_ROWS`) plus the exact total of
   *  matches, in a single DuckDB pass: the radius is a semi-join to `crm_property` inside SQL and a
   *  `permitNumber` lookup ignores the radius altogether. */
  async searchPermitsPage(query: SearchPermitsQuery): Promise<PermitsPage> {
    return withObservabilityOperation(this.obs, "LeadIndex.searchPermitsPage", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const conditions = permitConditions(query);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const reader = await this.runBounded(
        connection,
        `SELECT pm.*, (count(*) OVER ())::INTEGER AS "__total" FROM crm_permit pm ${where}
         ${permitOrderBy(query)} LIMIT ${String(pageLimit(query.limit))}`,
      );
      const raw = reader.getRowObjectsJS() as unknown as (PermitResult & { __total: number })[];
      const total = raw[0]?.__total ?? 0;
      const rows = raw.map(({ __total: _total, ...row }) => row as unknown as PermitResult);
      return { rows, total };
    });
  }

  async similarProperties(query: SimilarPropertiesQuery): Promise<SimilarPropertyRow[]> {
    return withObservabilityOperation(this.obs, "LeadIndex.similarProperties", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const { where, dist } = radiusSql(query.center, query.radiusMi, (n) => `"${n}"`);
      const typeSql =
        query.propertyType === null
          ? `"propertyType" IS NULL`
          : `"propertyType" = '${sqlEscapeString(query.propertyType)}'`;
      const lo = sqlNumber(query.roofAgeYears - query.roofAgeBand);
      const hi = sqlNumber(query.roofAgeYears + query.roofAgeBand);
      const limit = String(Math.min(10, Math.max(1, Math.floor(query.limit))));
      const reader = await this.runBounded(
        connection,
        `SELECT "propertyCid", "requestIdentifier", (${dist} / ${sqlNumber(milesToMeters(1))}) AS "distanceMi",
           "roofAgeYears", "roofAgeConfidence", "roofAgeBasis"
         FROM crm_property
         WHERE ${where} AND ${typeSql}
           AND "roofAgeYears" BETWEEN ${lo} AND ${hi}
           AND "propertyCid" <> '${sqlEscapeString(query.excludePropertyCid)}'
         ORDER BY ${dist}, "propertyCid" LIMIT ${limit}`,
      );
      return reader.getRowObjectsJS() as unknown as SimilarPropertyRow[];
    });
  }

  async getProperty(
    propertyCid: string,
  ): Promise<(PropertyResult & { permits: PermitResult[] }) | null> {
    return withObservabilityOperation(this.obs, "LeadIndex.getProperty", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const propertyReader = await connection.runAndReadAll(
        `SELECT * FROM crm_property WHERE "propertyCid" = '${sqlEscapeString(propertyCid)}'`,
      );
      const rows = propertyReader.getRowObjectsJS() as unknown as PropertyResult[];
      const property = rows[0];
      // null, not a thrown error, when the CID isn't in the currently promoted run (contracts/
      // lead-index-port.md) — later stories render this as a typed "not in this run" state.
      if (property === undefined) return null;

      const permitReader = await connection.runAndReadAll(
        `SELECT * FROM crm_permit WHERE "propertyCid" = '${sqlEscapeString(propertyCid)}'`,
      );
      const permits = permitReader.getRowObjectsJS() as unknown as PermitResult[];
      return { ...property, permits };
    });
  }

  async getPropertyByRequestIdentifier(
    requestIdentifier: string,
  ): Promise<PropertyResult | undefined> {
    return withObservabilityOperation(
      this.obs,
      "LeadIndex.getPropertyByRequestIdentifier",
      async () => {
        const { manifestCid } = await this.indexInfo();
        const { connection } = await this.ensureLoaded(manifestCid);
        const reader = await connection.runAndReadAll(
          `SELECT * FROM crm_property WHERE "requestIdentifier" = '${sqlEscapeString(requestIdentifier)}'`,
        );
        const rows = reader.getRowObjectsJS() as unknown as PropertyResult[];
        return rows[0];
      },
    );
  }

  async presentRequestIdentifiers(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    return withObservabilityOperation(this.obs, "LeadIndex.presentRequestIdentifiers", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const list = ids.map((id) => `'${sqlEscapeString(id)}'`).join(", ");
      const reader = await connection.runAndReadAll(
        `SELECT DISTINCT "requestIdentifier" FROM crm_property WHERE "requestIdentifier" IN (${list})`,
      );
      const rows = reader.getRowObjectsJS() as unknown as { requestIdentifier: string }[];
      return new Set(rows.map((r) => r.requestIdentifier));
    });
  }

  /** search.countyOverview: one DuckDB pass bins every matched, mapped property into the shared
   *  hex grid (median roof age per cell) and, with `permits`, joins the per-property open/stalled
   *  permit counts in the same pass; a second small query counts what cannot be drawn. Cached per
   *  manifestCid + filters (`overviewCache`), so a warm repeat costs one pointer read. */
  async countyOverview(query: CountyOverviewQuery): Promise<CountyOverview> {
    return withObservabilityOperation(this.obs, "LeadIndex.countyOverview", async () => {
      const { manifestCid } = await this.indexInfo();
      const cacheKey = overviewCacheKey(manifestCid, query);
      const cached = overviewCache.get(cacheKey);
      if (cached !== undefined) {
        this.obs.logger.info("countyOverview cache hit", { zoom: query.zoom });
        return cached;
      }
      const startedAt = Date.now();
      const pending = this.computeCountyOverview(manifestCid, query);
      overviewCache.set(cacheKey, pending);
      pending.catch(() => overviewCache.delete(cacheKey));
      if (overviewCache.size > OVERVIEW_CACHE_MAX) {
        const oldest = overviewCache.keys().next().value;
        if (oldest !== undefined) overviewCache.delete(oldest);
      }
      const result = await pending;
      this.obs.logger.info("countyOverview computed", {
        zoom: query.zoom,
        cells: result.cells.length,
        durationMs: Date.now() - startedAt,
      });
      return result;
    });
  }

  private async computeCountyOverview(
    manifestCid: string,
    query: CountyOverviewQuery,
  ): Promise<CountyOverview> {
    const { connection } = await this.ensureLoaded(manifestCid);
    const zoom = Math.max(0, Math.floor(query.zoom));
    const usage =
      query.propertyUsageType === undefined
        ? "TRUE"
        : `"propertyUsageType" = '${sqlEscapeString(query.propertyUsageType)}'`;
    const roof =
      query.roofAgeMinYears === undefined
        ? "TRUE"
        : `"roofAgeYears" >= ${String(Number(query.roofAgeMinYears))}`;
    const matched = `(${usage}) AND (${roof})`;

    const totalsReader = await connection.runAndReadAll(
      `SELECT count(*)::INTEGER AS total,
         (count(*) FILTER (WHERE ${matched}))::INTEGER AS matched,
         (count(*) FILTER (WHERE ${matched} AND (latitude IS NULL OR longitude IS NULL)))::INTEGER AS "noCoordinates",
         (count(*) FILTER (WHERE ${usage} AND "roofAgeYears" IS NULL))::INTEGER AS "noRoofDate",
         min("runId") AS "runId"
       FROM crm_property`,
    );
    const totals = totalsReader.getRowObjectsJS()[0] as unknown as {
      total: number;
      matched: number;
      noCoordinates: number;
      noRoofDate: number;
      runId: string | null;
    };

    const withPermits = query.permits === true;
    const permitWhere = [
      // "Open" includes stalled (a stalled permit is open and not progressing), as in isLivePermit.
      query.permitStatus === "stalled"
        ? `"statusClass" = 'stalled'`
        : `"statusClass" IN ('open', 'stalled')`,
      // A permit with a final date is finished, whatever its class (see NOT_FINALED_SQL).
      `"finalDate" IS NULL`,
      ...(query.permitOpenDaysMin === undefined
        ? []
        : [`"openDays" >= ${String(Number(query.permitOpenDaysMin))}`]),
    ].join(" AND ");
    const permitCte = withPermits
      ? `perm AS (
           SELECT "propertyCid",
             count(*) FILTER (WHERE "statusClass" = 'open') AS o,
             count(*) FILTER (WHERE "statusClass" = 'stalled') AS s,
             max("openDays") AS m
           FROM crm_permit WHERE ${permitWhere} GROUP BY "propertyCid"
         ),`
      : "";
    const src = withPermits
      ? `SELECT p.latitude AS lat, p.longitude AS lng, p."roofAgeYears" AS age, perm.o, perm.s, perm.m
         FROM crm_property p LEFT JOIN perm ON perm."propertyCid" = p."propertyCid"
         WHERE ${matched} AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL`
      : `SELECT latitude AS lat, longitude AS lng, "roofAgeYears" AS age
         FROM crm_property WHERE ${matched} AND latitude IS NOT NULL AND longitude IS NOT NULL`;
    const permitCols = withPermits
      ? `, coalesce(sum(o), 0)::INTEGER AS "openPermits", coalesce(sum(s), 0)::INTEGER AS "stalledPermits", max(m)::INTEGER AS "maxOpenDays"`
      : "";
    const cellsReader = await connection.runAndReadAll(
      `WITH ${permitCte} src AS (${src}), ${hexCellSql(zoom, "src")}
       SELECT q::INTEGER AS q, r::INTEGER AS r, count(*)::INTEGER AS count,
         count(age)::INTEGER AS "withRoofAge", median(age)::DOUBLE AS "medianRoofAge",
         (count(*) FILTER (WHERE age >= ${String(DEFAULT_ROOF_AGE_YEARS)}))::INTEGER AS "agedCount"
         ${permitCols}
       FROM axial GROUP BY q, r ORDER BY r, q`,
    );
    const rows = cellsReader.getRowObjectsJS() as unknown as {
      q: number;
      r: number;
      count: number;
      withRoofAge: number;
      medianRoofAge: number | null;
      agedCount: number;
      openPermits?: number;
      stalledPermits?: number;
      maxOpenDays?: number | null;
    }[];

    let binned = 0;
    let withAge = 0;
    let openPermits = 0;
    let stalledPermits = 0;
    const cells: CountyOverviewCell[] = rows.map((row) => {
      binned += row.count;
      withAge += row.withRoofAge;
      const [lng, lat] = hexCellCenter(row.q, row.r, zoom);
      const cell: CountyOverviewCell = {
        q: row.q,
        r: row.r,
        lat: round(lat, 5),
        lng: round(lng, 5),
        count: row.count,
        withRoofAge: row.withRoofAge,
        medianRoofAge: row.medianRoofAge === null ? null : round(row.medianRoofAge, 1),
        agedCount: row.agedCount,
      };
      if (withPermits) {
        openPermits += row.openPermits ?? 0;
        stalledPermits += row.stalledPermits ?? 0;
        cell.openPermits = row.openPermits ?? 0;
        cell.stalledPermits = row.stalledPermits ?? 0;
        cell.maxOpenDays = row.maxOpenDays ?? null;
      }
      return cell;
    });

    return {
      zoom,
      agedYears: DEFAULT_ROOF_AGE_YEARS,
      cells,
      counts: {
        total: totals.total,
        matched: totals.matched,
        binned,
        excludedNoCoordinates: totals.noCoordinates,
        excludedNoRoofDate: query.roofAgeMinYears === undefined ? 0 : totals.noRoofDate,
        binnedWithoutRoofAge: binned - withAge,
        ...(withPermits ? { openPermits, stalledPermits } : {}),
      },
      manifestCid,
      runId: totals.runId ?? null,
    };
  }

  async currentRunId(): Promise<string | undefined> {
    return withObservabilityOperation(this.obs, "LeadIndex.currentRunId", async () => {
      const { manifestCid } = await this.indexInfo();
      const { connection } = await this.ensureLoaded(manifestCid);
      const reader = await connection.runAndReadAll(`SELECT "runId" FROM crm_property LIMIT 1`);
      const rows = reader.getRowObjectsJS() as unknown as { runId: string | null }[];
      return rows[0]?.runId ?? undefined;
    });
  }
}
