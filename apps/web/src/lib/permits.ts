/**
 * Tier A leads: open roofing permits within a radius, joined to their matched
 * property for coordinates and roof-age context.
 *
 * The permits table has no coordinates of its own yet (permit_lat/lon are
 * unpopulated in the published data as of dataset_version
 * 2026-09-01.r202609011309), so this geolocates via the matched property
 * instead -- see buildOpenPermitRadiusQuery. A permit with no confident
 * parcel match cannot appear here; countUnlocatableOpenRoofingPermits reports
 * how many are missing so that gap is visible rather than silently dropped.
 */
import type { DataSource, LatestManifest, RoofAgeBasis } from '@roofing-crm/consumer';
import { tableUrls } from '@roofing-crm/consumer';
import {
  buildOpenPermitRadiusQuery, buildUnlocatableOpenPermitCountQuery, leadScore, toNumber, type LatLon,
} from '@roofing-crm/shared';
import { getConnection, getDuckDB, registerTableFiles, runQuery } from './duckdb.js';
import type { LeadCandidate } from './leads.js';

/** Below this, a permit's parcel match is not trusted enough to geolocate it. */
const MIN_MATCH_CONFIDENCE = 0.8;

function toRoofAgeBasis(value: unknown): RoofAgeBasis {
  return value === 'PERMIT' || value === 'ACT_YR_BLT' || value === 'EFF_YR_BLT' ? value : 'UNKNOWN';
}

export interface OpenPermitCandidate extends LeadCandidate {
  permitId: string;
  permitNumber: string;
  issuedDate: string | null;
  permitOpenDays: number;
}

function toOpenPermitCandidate(row: Record<string, unknown>): OpenPermitCandidate {
  const permitOpenDays = toNumber(row['permit_open_days']);
  const tierInput = {
    roofAgeYears: null, roofAgeBasis: toRoofAgeBasis(row['roof_age_basis']),
    hasOpenRoofingPermit: true, roofAgeThreshold: 0,
  };
  return {
    parcelId: String(row['parcel_id'] ?? ''),
    address: (row['situs_address'] as string | null) ?? null,
    city: (row['situs_city'] as string | null) ?? null,
    zip: (row['situs_zip'] as string | null) ?? null,
    lat: toNumber(row['lat']),
    lon: toNumber(row['lon']),
    distanceMiles: toNumber(row['distance_miles']),
    roofAgeYears: row['roof_age_years'] === null || row['roof_age_years'] === undefined
      ? null : toNumber(row['roof_age_years']),
    roofAgeBasis: toRoofAgeBasis(row['roof_age_basis']),
    yearBuilt: row['year_built'] === null || row['year_built'] === undefined ? null : toNumber(row['year_built']),
    tier: 'A',
    score: leadScore({ ...tierInput, permitOpenDays, statusUnconfirmed: false }),
    permitId: String(row['permit_id'] ?? ''),
    permitNumber: String(row['permit_number'] ?? ''),
    issuedDate: (row['issued_date'] as string | null) ?? null,
    permitOpenDays,
  };
}

export interface OpenPermitQuery {
  center: LatLon;
  radiusMiles: number;
  limit?: number;
}

export async function queryOpenRoofingPermitLeads(
  source: DataSource,
  manifest: LatestManifest,
  q: OpenPermitQuery,
): Promise<OpenPermitCandidate[]> {
  const db = await getDuckDB();
  const conn = await getConnection();
  const propertyUrls = tableUrls(source, manifest, 'properties');
  const permitUrls = tableUrls(source, manifest, 'permits');
  const propertyFiles = await registerTableFiles(db, 'properties', propertyUrls);
  const permitFiles = await registerTableFiles(db, 'permits', permitUrls);

  const sql = buildOpenPermitRadiusQuery(propertyFiles, permitFiles, {
    center: q.center, radiusMiles: q.radiusMiles,
    minMatchConfidence: MIN_MATCH_CONFIDENCE, limit: q.limit ?? 200,
  });
  const { rows } = await runQuery(conn, sql);
  return rows.map(toOpenPermitCandidate);
}

/** County-wide, not radius-scoped -- see buildUnlocatableOpenPermitCountQuery. */
export async function countUnlocatableOpenRoofingPermits(
  source: DataSource,
  manifest: LatestManifest,
): Promise<number> {
  const db = await getDuckDB();
  const conn = await getConnection();
  const permitUrls = tableUrls(source, manifest, 'permits');
  const permitFiles = await registerTableFiles(db, 'permits', permitUrls);
  const sql = buildUnlocatableOpenPermitCountQuery(permitFiles, MIN_MATCH_CONFIDENCE);
  const { rows } = await runQuery(conn, sql);
  return toNumber(rows[0]?.['n']);
}
