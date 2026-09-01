/**
 * SQL builders for radius search over the pipeline's geohash-sorted Parquet.
 *
 * Every value is bound as a parameter rather than interpolated. That is not
 * only injection hygiene: interpolating a negative longitude produces
 * `lon--80.8076`, and `--` opens a SQL line comment that silently truncates the
 * statement. Binding makes that class of bug impossible.
 */
import { boundingBox, geohashRangesForBox, precisionForRadius, prefixUpperBound, type LatLon } from './geo.js';

export interface SqlQuery {
  sql: string;
  params: (string | number | boolean | null)[];
}

export interface RadiusFilter {
  center: LatLon;
  radiusMiles: number;
  /** Minimum roof age in years. Null disables the roof-age predicate entirely. */
  minRoofAgeYears: number | null;
  /** Restrict to these roof-age bases; empty means no basis restriction. */
  roofAgeBases: readonly string[];
  limit: number;
}

/** Miles-per-degree factor used by the in-SQL haversine refinement. */
const EARTH_RADIUS_MILES = 3958.7613;

interface SpatialPredicate {
  /** WHERE-clause fragments (geohash range(s), lat/lon bbox); AND them together. */
  clauses: string[];
  params: (string | number)[];
  /** Haversine SQL, referencing `${latCol}`/`${lonCol}` — appears twice (SELECT + WHERE). */
  distanceExpr: string;
  /** Params for one occurrence of distanceExpr; repeat verbatim for the second. */
  centreParams: number[];
}

/**
 * Three-stage predicate, cheapest first, shared by every radius query:
 *   1. geohash range(s)  — prunes whole row groups, and because rows are
 *      geohash-sorted these stats are non-overlapping, unlike lat/lon
 *   2. lat/lon bounding box — prunes further within surviving groups
 *   3. haversine          — exact, applied only to what survives
 *
 * `geohashCol` may be null to skip stage 1 (the permits table has no geohash
 * column of its own — see buildOpenPermitRadiusQuery, which prunes on the
 * joined properties row instead).
 */
function buildSpatialPredicate(
  center: LatLon,
  radiusMiles: number,
  latCol: string,
  lonCol: string,
  geohashCol: string | null,
): SpatialPredicate {
  const box = boundingBox(center, radiusMiles);
  const params: (string | number)[] = [];
  const clauses: string[] = [];

  if (geohashCol !== null) {
    const precision = precisionForRadius(radiusMiles);
    const ranges = geohashRangesForBox(box, precision);
    if (ranges.length > 0) {
      const geohashPredicate = ranges
        .map((r) => {
          params.push(r.start, prefixUpperBound(r.end));
          return `(${geohashCol} >= ? AND ${geohashCol} < ?)`;
        })
        .join(' OR ');
      clauses.push(`(${geohashPredicate})`);
    }
  }

  params.push(box.minLat, box.maxLat, box.minLon, box.maxLon);
  clauses.push(`${latCol} BETWEEN ? AND ?`, `${lonCol} BETWEEN ? AND ?`);

  const distanceExpr = `2 * ${EARTH_RADIUS_MILES} * asin(sqrt(
      pow(sin(radians(${latCol} - ?) / 2), 2)
      + cos(radians(?)) * cos(radians(${latCol})) * pow(sin(radians(${lonCol} - (?)) / 2), 2)
    ))`;

  return { clauses, params, distanceExpr, centreParams: [center.lat, center.lat, center.lon] };
}

export function buildRadiusQuery(table: string | readonly string[], f: RadiusFilter): SqlQuery {
  const spatial = buildSpatialPredicate(f.center, f.radiusMiles, 'lat', 'lon', 'geohash');
  const clauses = [...spatial.clauses];
  const params = [...spatial.params];

  if (f.minRoofAgeYears !== null) {
    // roof_age_years IS NULL means the basis is UNKNOWN. It must never satisfy
    // an "older than N" test by defaulting to zero or passing silently.
    clauses.push('roof_age_years IS NOT NULL AND roof_age_years >= ?');
    params.push(f.minRoofAgeYears);
  }
  if (f.roofAgeBases.length > 0) {
    clauses.push(`roof_age_basis IN (${f.roofAgeBases.map(() => '?').join(', ')})`);
    params.push(...f.roofAgeBases);
  }

  const sql = `
    SELECT *, ${spatial.distanceExpr} AS distance_miles
    FROM read_parquet(${sqlLiteralList(table)})
    WHERE ${clauses.join(' AND ')}
      AND ${spatial.distanceExpr} <= ?
    ORDER BY distance_miles
    LIMIT ?`;

  // Parameter order must match the two occurrences of distanceExpr in the SQL.
  const all = [
    ...spatial.centreParams,  // SELECT distance
    ...params,                // WHERE predicates
    ...spatial.centreParams,  // AND distance <= ?
    f.radiusMiles,
    f.limit,
  ];
  return { sql, params: all };
}

export interface OpenPermitRadiusFilter {
  center: LatLon;
  radiusMiles: number;
  /** Below this, a permit's parcel match is not trusted enough to geolocate it. */
  minMatchConfidence: number;
  limit: number;
}

/**
 * Open roofing permits within a radius — Tier A, the strongest lead signal.
 *
 * The permits table carries no coordinates of its own yet (permit_lat/lon are
 * unpopulated in the published data), so this prunes and geolocates via the
 * matched property's row instead: join to properties on parcel_id, apply the
 * same geohash+bbox+haversine pruning to the property side, and require a
 * roofing permit that is open and confidently matched. A permit with no
 * confident parcel match cannot appear here at all -- callers should surface
 * that gap explicitly (see countUnlocatableOpenRoofingPermits) rather than
 * let it silently disappear.
 */
export function buildOpenPermitRadiusQuery(
  propertiesTable: string | readonly string[],
  permitsTable: string | readonly string[],
  f: OpenPermitRadiusFilter,
): SqlQuery {
  const spatial = buildSpatialPredicate(f.center, f.radiusMiles, 'p.lat', 'p.lon', 'p.geohash');
  const clauses = [
    ...spatial.clauses,
    'pm.is_roofing', 'pm.is_open',
    'pm.parcel_id IS NOT NULL', 'pm.match_confidence >= ?',
  ];
  const params: (string | number)[] = [...spatial.params, f.minMatchConfidence];

  const sql = `
    SELECT
      p.parcel_id, p.lat, p.lon, p.situs_address, p.situs_city, p.situs_zip,
      p.roof_age_years, p.roof_age_basis, p.year_built,
      pm.permit_id, pm.permit_number, pm.permit_status_normalized,
      CAST(pm.issued_date AS VARCHAR) AS issued_date,
      pm.permit_open_days, pm.work_description, pm.contractor_entity_id,
      ${spatial.distanceExpr} AS distance_miles
    FROM read_parquet(${sqlLiteralList(propertiesTable)}) p
    JOIN read_parquet(${sqlLiteralList(permitsTable)}) pm ON p.parcel_id = pm.parcel_id
    WHERE ${clauses.join(' AND ')}
      AND ${spatial.distanceExpr} <= ?
    ORDER BY pm.permit_open_days DESC
    LIMIT ?`;

  const all = [
    ...spatial.centreParams,
    ...params,
    ...spatial.centreParams,
    f.radiusMiles,
    f.limit,
  ];
  return { sql, params: all };
}

/**
 * County-wide (not radius-scoped) count of open roofing permits that cannot
 * be placed on the map at all -- no parcel match, or one below the confidence
 * bar. Shown as an explicit count rather than silently dropped, per the same
 * honesty rule as UNKNOWN roof-age basis: absence of evidence is stated, not
 * hidden.
 */
export function buildUnlocatableOpenPermitCountQuery(
  permitsTable: string | readonly string[],
  minMatchConfidence: number,
): SqlQuery {
  const sql = `
    SELECT COUNT(*) AS n
    FROM read_parquet(${sqlLiteralList(permitsTable)})
    WHERE is_roofing AND is_open
      AND (parcel_id IS NULL OR match_confidence < ?)`;
  return { sql, params: [minMatchConfidence] };
}

/**
 * Parquet paths are structural, not user input, so they are embedded — but
 * quoted defensively so a path containing a quote cannot break out. A single
 * path becomes `'path'`; multiple (the pipeline's geohash4 partitions can be
 * up to 8 files per table) become a real DuckDB list literal `['a','b']`,
 * never a single string with brackets pasted into it.
 */
function sqlLiteralList(paths: string | readonly string[]): string {
  const quote = (p: string): string => `'${p.replace(/'/g, "''")}'`;
  if (typeof paths === 'string') return quote(paths);
  return `[${paths.map(quote).join(', ')}]`;
}

/** Columns that DuckDB returns as BigInt or epoch ints and must be coerced. */
export const BIGINT_COLUMNS = ['permit_open_days', 'row_count', 'count', 'building_count'] as const;
export const DATE_COLUMNS = ['issued_date', 'closed_date', 'loaded_at', 'bbb_harvested_at'] as const;

/**
 * DATE columns arrive through Arrow as epoch integers, so `String(d)` yields
 * something like "1674086400" rather than a date. Casting in SQL is the only
 * reliable fix; this builds the projection.
 */
export function dateSafeProjection(columns: readonly string[]): string {
  return columns
    .map((c) => (DATE_COLUMNS.includes(c as (typeof DATE_COLUMNS)[number]) ? `CAST(${c} AS VARCHAR) AS ${c}` : c))
    .join(', ');
}

/** Arrow hands back BigInt for integer aggregates; mixing those with Number throws. */
export function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (value === null || value === undefined) return 0;
  return Number(value);
}
