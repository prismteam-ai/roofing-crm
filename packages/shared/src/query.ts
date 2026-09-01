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

/**
 * Three-stage predicate, cheapest first:
 *   1. geohash range(s)  — prunes whole row groups, and because rows are
 *      geohash-sorted these stats are non-overlapping, unlike lat/lon
 *   2. lat/lon bounding box — prunes further within surviving groups
 *   3. haversine          — exact, applied only to what survives
 */
export function buildRadiusQuery(table: string, f: RadiusFilter): SqlQuery {
  const box = boundingBox(f.center, f.radiusMiles);
  const precision = precisionForRadius(f.radiusMiles);
  const ranges = geohashRangesForBox(box, precision);
  const params: (string | number | boolean | null)[] = [];

  const geohashPredicate = ranges
    .map((r) => {
      params.push(r.start, prefixUpperBound(r.end));
      return '(geohash >= ? AND geohash < ?)';
    })
    .join(' OR ');

  params.push(box.minLat, box.maxLat, box.minLon, box.maxLon);

  const clauses = [
    ranges.length > 0 ? `(${geohashPredicate})` : null,
    'lat BETWEEN ? AND ?',
    'lon BETWEEN ? AND ?',
  ].filter(Boolean);

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

  // Bind the centre for the distance expression, then again for ORDER BY.
  const distance = `2 * ${EARTH_RADIUS_MILES} * asin(sqrt(
      pow(sin(radians(lat - ?) / 2), 2)
      + cos(radians(?)) * cos(radians(lat)) * pow(sin(radians(lon - (?)) / 2), 2)
    ))`;

  const sql = `
    SELECT *, ${distance} AS distance_miles
    FROM read_parquet(${sqlLiteralList(table)})
    WHERE ${clauses.join(' AND ')}
      AND ${distance} <= ?
    ORDER BY distance_miles
    LIMIT ?`;

  // Parameter order must match the two occurrences of `distance` in the SQL.
  const centreParams = [f.center.lat, f.center.lat, f.center.lon];
  const all = [
    ...centreParams,          // SELECT distance
    ...params,                // WHERE predicates
    ...centreParams,          // AND distance <= ?
    f.radiusMiles,
    f.limit,
  ];
  return { sql, params: all };
}

/**
 * Parquet paths are structural, not user input, so they are embedded — but
 * quoted defensively so a path containing a quote cannot break out.
 */
function sqlLiteralList(paths: string): string {
  return `'${paths.replace(/'/g, "''")}'`;
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
