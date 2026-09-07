import { z } from "zod";
import { OSCEOLA, RADIUS_MILES } from "@/lib/config/county";
import { bboxSql, haversineSql } from "./geo";
import { idLiteral, ilikeTerm, int, num } from "./sql";

/**
 * SQL builders for the MCP `permits` view.
 *
 * @module queries/permits
 */

const PERMIT_COLUMNS = [
  "permit_number",
  "parcel_identifier",
  "improvement_type",
  "improvement_status",
  "improvement_action",
  "is_roofing",
  "is_open",
  "days_open",
  "permit_issue_date",
  "permit_close_date",
  "final_inspection_date",
  "expiration_date",
  "project_description",
  "description",
  "estimated_job_value",
  "issuing_agency",
  "source_system",
  "contractor_name",
  "contractor_qualifier",
  "contractor_phone",
  "contractor_license",
  "bbb_rating",
  "bbb_accredited",
  "bbb_profile_url",
  "bbb_match_method",
  "source_url",
  "address_street",
  "address_city",
  "latitude",
  "longitude",
] as const;

/** Permits attached to one parcel (roofing first, newest first). */
export function buildPermitsForParcelQuery(parcelNumber: string, limit = 200): string {
  const lit = idLiteral(parcelNumber);
  return (
    `SELECT ${PERMIT_COLUMNS.join(", ")}\nFROM permits\nWHERE parcel_identifier = ${lit}\n` +
    `ORDER BY is_roofing DESC, is_open DESC, permit_issue_date DESC NULLS LAST\nLIMIT ${int(limit, { min: 1, max: 1000 })}`
  );
}

/** Permits for many parcels at once (lead creation snapshot). */
export function buildPermitsForParcelsQuery(
  parcelNumbers: readonly string[],
  roofingOnly = true,
): string {
  if (parcelNumbers.length === 0 || parcelNumbers.length > 100)
    throw new RangeError("Provide 1-100 parcel ids");
  const list = parcelNumbers.map(idLiteral).join(", ");
  return (
    `SELECT ${PERMIT_COLUMNS.join(", ")}\nFROM permits\nWHERE parcel_identifier IN (${list})${roofingOnly ? " AND is_roofing" : ""}\n` +
    `ORDER BY is_open DESC, permit_issue_date DESC NULLS LAST\nLIMIT 1000`
  );
}

/** Zod schema for the "open roofing permits near a point" query used by the agent. */
export const openPermitSearchSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMiles: z.coerce.number().min(RADIUS_MILES.min).max(RADIUS_MILES.max).default(5),
  minYearsOpen: z.coerce.number().min(0).max(50).default(OSCEOLA.thresholds.longOpenPermitYears),
  contractor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type OpenPermitSearch = z.infer<typeof openPermitSearchSchema>;

/** Long-open roofing permits within a radius, oldest first, with contractor and BBB columns. */
export function buildOpenRoofPermitsQuery(input: z.input<typeof openPermitSearchSchema>): {
  sql: string;
  params: OpenPermitSearch;
} {
  const p = openPermitSearchSchema.parse(input);
  const center = { lat: num(p.lat), lng: num(p.lng) };
  const radius = num(p.radiusMiles, { decimals: 2 });
  const minDays = Math.round(p.minYearsOpen * 365);
  const clauses = [
    "is_roofing",
    "is_open",
    `days_open >= ${int(minDays, { min: 0 })}`,
    "latitude IS NOT NULL",
    bboxSql(center, radius),
    `${haversineSql(center)} <= ${radius}`,
  ];
  if (p.contractor) clauses.push(`contractor_name ILIKE ${ilikeTerm(p.contractor)}`);
  const sql =
    `SELECT ${PERMIT_COLUMNS.join(", ")},\n  ${haversineSql(center)} AS distance_miles\nFROM permits\nWHERE ${clauses.join("\n  AND ")}\n` +
    `ORDER BY days_open DESC\nLIMIT ${int(p.limit, { min: 1, max: 500 })}`;
  return { sql, params: p };
}

/** BBB letter ratings from best to worst (used to pick a parcel's best-rated contractor). */
export const BBB_RATING_ORDER = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
] as const;

/** Rank of a rating (lower is better); unknown ratings sort last. */
export function bbbRatingRank(rating: string | null | undefined): number {
  const i = (BBB_RATING_ORDER as readonly string[]).indexOf((rating ?? "").toUpperCase());
  return i === -1 ? BBB_RATING_ORDER.length : i;
}

/**
 * Rated contractors per parcel (one row per parcel/rating/method/contractor, roofing flagged),
 * used to decorate search results with the best BBB rating. Cheap: an IN-list over permits.
 */
export function buildParcelBbbRatingsQuery(parcelNumbers: readonly string[]): string {
  if (parcelNumbers.length === 0 || parcelNumbers.length > 100)
    throw new RangeError("Provide 1-100 parcel ids");
  const list = parcelNumbers.map(idLiteral).join(", ");
  return (
    `SELECT parcel_identifier, bbb_rating, bbb_match_method, contractor_name, bool_or(is_roofing) AS any_roofing, count(*) AS n\n` +
    `FROM permits\nWHERE parcel_identifier IN (${list}) AND bbb_rating IS NOT NULL\n` +
    `GROUP BY 1, 2, 3, 4\nLIMIT 1000`
  );
}
