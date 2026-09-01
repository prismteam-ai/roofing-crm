/**
 * Runs a live radius query against the `properties` table and classifies
 * each result into an evidence tier from roof age alone (B/C/UNKNOWN).
 *
 * Tier A (open roofing permit) never comes from here -- `hasOpenRoofingPermit`
 * is always `false` in this module, deliberately: that classification needs
 * the `permits` join, which lives in ./permits.ts and is merged in by the
 * caller (App.tsx).
 */
import type { DataSource, LatestManifest, RoofAgeBasis } from '@roofing-crm/consumer';
import { tableUrls } from '@roofing-crm/consumer';
import {
  buildRadiusQuery, classifyTier, leadScore, toNumber, type EvidenceTier, type LatLon,
} from '@roofing-crm/shared';
import { getConnection, getDuckDB, registerTableFiles, runQuery } from './duckdb.js';

export interface LeadCandidate {
  parcelId: string;
  parcelIdNorm: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
  roofAgeYears: number | null;
  roofAgeBasis: RoofAgeBasis;
  yearBuilt: number | null;
  /** FDOR "just value" -- the closest thing to a valuation this dataset carries. */
  justValue: number | null;
  livingAreaSqft: number | null;
  landUseCode: string | null;
  ownerName: string | null;
  tier: EvidenceTier;
  score: number;
}

export interface CandidateQuery {
  center: LatLon;
  radiusMiles: number;
  roofAgeThreshold: number;
  limit?: number;
}

function toRoofAgeBasis(value: unknown): RoofAgeBasis {
  return value === 'PERMIT' || value === 'ACT_YR_BLT' || value === 'EFF_YR_BLT' ? value : 'UNKNOWN';
}

function toLeadCandidate(row: Record<string, unknown>, roofAgeThreshold: number): LeadCandidate {
  const roofAgeYears = row['roof_age_years'] === null || row['roof_age_years'] === undefined
    ? null
    : toNumber(row['roof_age_years']);
  const roofAgeBasis = toRoofAgeBasis(row['roof_age_basis']);
  const tierInput = {
    roofAgeYears, roofAgeBasis, hasOpenRoofingPermit: false, roofAgeThreshold,
  };
  return {
    parcelId: String(row['parcel_id'] ?? ''),
    parcelIdNorm: (row['parcel_id_norm'] as string | null) ?? null,
    address: (row['situs_address'] as string | null) ?? null,
    city: (row['situs_city'] as string | null) ?? null,
    zip: (row['situs_zip'] as string | null) ?? null,
    lat: toNumber(row['lat']),
    lon: toNumber(row['lon']),
    distanceMiles: toNumber(row['distance_miles']),
    roofAgeYears,
    roofAgeBasis,
    yearBuilt: row['year_built'] === null || row['year_built'] === undefined ? null : toNumber(row['year_built']),
    justValue: row['just_value'] === null || row['just_value'] === undefined ? null : toNumber(row['just_value']),
    livingAreaSqft: row['living_area_sqft'] === null || row['living_area_sqft'] === undefined
      ? null : toNumber(row['living_area_sqft']),
    landUseCode: (row['land_use_code'] as string | null) ?? null,
    ownerName: (row['owner_name'] as string | null) ?? null,
    tier: classifyTier(tierInput),
    score: leadScore({ ...tierInput, permitOpenDays: null, statusUnconfirmed: false }),
  };
}

/**
 * Registers the properties table (once per session; subsequent calls reuse
 * the same registration) and runs a radius query against it live in-browser.
 */
export async function queryLeadCandidates(
  source: DataSource,
  manifest: LatestManifest,
  q: CandidateQuery,
): Promise<LeadCandidate[]> {
  const db = await getDuckDB();
  const conn = await getConnection();
  const urls = tableUrls(source, manifest, 'properties');
  const files = await registerTableFiles(db, 'properties', urls);

  const sql = buildRadiusQuery(files, {
    center: q.center,
    radiusMiles: q.radiusMiles,
    minRoofAgeYears: q.roofAgeThreshold,
    roofAgeBases: [],
    limit: q.limit ?? 200,
  });
  const { rows } = await runQuery(conn, sql);
  return rows
    .map((row) => toLeadCandidate(row, q.roofAgeThreshold))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
