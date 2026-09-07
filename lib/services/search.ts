import "server-only";
import { OSCEOLA } from "@/lib/config/county";
import { mcp } from "@/lib/mcp/client";
import type { McpDataSource } from "@/lib/mcp/types";
import {
  buildCandidateCountQuery,
  buildCandidateQuery,
  buildPropertiesByIdsQuery,
  buildPropertyByIdQuery,
  longOpenDays,
  type SearchParams,
  type SearchParamsInput,
} from "@/lib/queries/properties";
import {
  bbbRatingRank,
  buildParcelBbbRatingsQuery,
  buildPermitsForParcelQuery,
  buildPermitsForParcelsQuery,
} from "@/lib/queries/permits";
import {
  mapPermitRow,
  mapPropertyRow,
  toBool,
  toNum,
  toStr,
  type PermitRecord,
  type PropertyCandidate,
} from "@/lib/queries/types";

/**
 * Read-side services over the MCP boundary: radius search, property detail and
 * multi-parcel fetches used by lead creation.
 *
 * @module services/search
 */

/** Result of a radius search: the capped rows plus uncapped totals. */
export interface SearchResult {
  params: SearchParams;
  rows: PropertyCandidate[];
  totals: {
    total: number;
    openPermits: number;
    longOpenPermits: number;
    agedRoofs: number;
    outOfStateOwners: number;
    bbbParcels: number;
  };
  truncated: boolean;
  sql: { rows: string; count: string };
}

/** Run the radius lead search (two MCP calls: rows + counts). */
export async function searchCandidates(
  input: SearchParamsInput,
  source: McpDataSource = mcp,
): Promise<SearchResult> {
  const { sql, params } = buildCandidateQuery(input);
  const { sql: countSql } = buildCandidateCountQuery(input);
  const thresholds = { roofAgeYears: params.roofAgeMin, longOpenDays: longOpenDays(params) };
  const [rowsRes, countRes] = await Promise.all([
    source.queryProperties(sql, params.limit),
    source.queryProperties(countSql, 1),
  ]);
  const c = countRes.rows[0] ?? {};
  const totals = {
    total: toNum(c.total) ?? 0,
    openPermits: toNum(c.open_permits) ?? 0,
    longOpenPermits: toNum(c.long_open_permits) ?? 0,
    agedRoofs: toNum(c.aged_roofs) ?? 0,
    outOfStateOwners: toNum(c.out_of_state_owners) ?? 0,
    bbbParcels: toNum(c.bbb_parcels) ?? 0,
  };
  const rows = await decorateBestBbbRating(
    rowsRes.rows.map((r) => mapPropertyRow(r, thresholds)),
    source,
  );
  return {
    params,
    rows,
    totals,
    truncated: totals.total > rows.length,
    sql: { rows: sql, count: countSql },
  };
}

/** Lead-signal thresholds used to classify a property (mirrors the map's filters). */
export interface SignalThresholds {
  roofAgeYears: number;
  longOpenDays: number;
}

/** County default thresholds. */
export const DEFAULT_THRESHOLDS: SignalThresholds = {
  roofAgeYears: OSCEOLA.thresholds.roofAgeYears,
  longOpenDays: OSCEOLA.thresholds.longOpenPermitYears * 365,
};

/**
 * Property detail with its permits. Returns `null` when the parcel is unknown.
 * Pass the user's current thresholds so the drawer's signal badge matches the list.
 */
export async function getPropertyDetail(
  parcelId: string,
  source: McpDataSource = mcp,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
): Promise<{ property: PropertyCandidate; permits: PermitRecord[] } | null> {
  const res = await source.queryProperties(buildPropertyByIdQuery(parcelId), 1);
  const raw = res.rows[0];
  if (!raw) return null;
  const property = mapPropertyRow(raw, thresholds);
  const permitsRes = await source.queryPermits(
    buildPermitsForParcelQuery(property.parcelNumber ?? property.parcelId),
    200,
  );
  return { property, permits: permitsRes.rows.map(mapPermitRow) };
}

/**
 * Fill `bbbBestRating` / `bbbMatchMethod` / `bbbContractorName` for candidates whose parcel has a
 * BBB-rated contractor. One extra MCP query per 100 rated parcels; roofing permits win ties.
 */
export async function decorateBestBbbRating(
  rows: PropertyCandidate[],
  source: McpDataSource,
): Promise<PropertyCandidate[]> {
  const rated = rows.filter((r) => r.hasBbbContractor);
  if (rated.length === 0) return rows;
  const ids = [...new Set(rated.map((r) => r.parcelNumber ?? r.parcelId))];
  const best = new Map<
    string,
    { rating: string; method: string | null; contractor: string | null; roofing: boolean }
  >();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await source.queryPermits(buildParcelBbbRatingsQuery(chunk), 1000);
    for (const row of res.rows) {
      const key = String(row.parcel_identifier ?? "");
      const rating = toStr(row.bbb_rating);
      if (!key || !rating) continue;
      const candidate = {
        rating,
        method: toStr(row.bbb_match_method),
        contractor: toStr(row.contractor_name),
        roofing: toBool(row.any_roofing) ?? false,
      };
      const current = best.get(key);
      const better =
        !current ||
        (candidate.roofing && !current.roofing) ||
        (candidate.roofing === current.roofing &&
          bbbRatingRank(candidate.rating) < bbbRatingRank(current.rating));
      if (better) best.set(key, candidate);
    }
  }
  return rows.map((r) => {
    const b = best.get(r.parcelNumber ?? r.parcelId);
    return b
      ? { ...r, bbbBestRating: b.rating, bbbMatchMethod: b.method, bbbContractorName: b.contractor }
      : r;
  });
}

/** Fetch many properties and their roofing permits (lead creation). */
export async function getPropertiesWithPermits(
  parcelIds: readonly string[],
  source: McpDataSource = mcp,
  thresholds: SignalThresholds = DEFAULT_THRESHOLDS,
): Promise<Array<{ property: PropertyCandidate; permits: PermitRecord[] }>> {
  const unique = [...new Set(parcelIds)];
  if (unique.length === 0) return [];
  const props = (
    await source.queryProperties(buildPropertiesByIdsQuery(unique), unique.length)
  ).rows.map((r) => mapPropertyRow(r, thresholds));
  if (props.length === 0) return [];
  const parcelNumbers = props.map((p) => p.parcelNumber ?? p.parcelId);
  const permits = (
    await source.queryPermits(buildPermitsForParcelsQuery(parcelNumbers, true), 1000)
  ).rows.map(mapPermitRow);
  const byParcel = new Map<string, PermitRecord[]>();
  for (const pr of permits) {
    const key = pr.parcelNumber ?? "";
    byParcel.set(key, [...(byParcel.get(key) ?? []), pr]);
  }
  return props.map((property) => ({
    property,
    permits: byParcel.get(property.parcelNumber ?? property.parcelId) ?? [],
  }));
}
