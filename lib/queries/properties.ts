import { z } from "zod";
import { OSCEOLA, RADIUS_MILES } from "@/lib/config/county";
import { bboxSql, haversineSql } from "./geo";
import { idLiteral, int, num, oneOf } from "./sql";

/**
 * SQL builders for the MCP `properties` view. All inputs are validated with Zod and
 * only numbers / whitelisted enums / validated identifiers are interpolated.
 *
 * @module queries/properties
 */

/** Sort keys accepted by the radius search. */
export const SORT_KEYS = ["priority", "roof_age", "days_open", "value", "distance"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Boolean that also accepts "true"/"false"/"1"/"0" strings (URL params). */
export const boolParam = z.preprocess(
  (v) =>
    typeof v === "string" ? ["true", "1", "on", "yes"].includes(v.toLowerCase()) : Boolean(v),
  z.boolean(),
);

/** Nullable number that treats "", "null" and undefined as null (URL params). */
export function nullableNumParam(min: number, max: number) {
  return z.preprocess(
    (v) => (v === "" || v === undefined || v === null || v === "null" ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );
}

/** Zod schema for a radius lead search; shared by the API route, the map UI and the agent tool. */
export const searchParamsSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMiles: z.coerce
    .number()
    .min(RADIUS_MILES.min)
    .max(RADIUS_MILES.max)
    .default(OSCEOLA.thresholds.radiusMiles),
  /** Roofs at least this old (years) qualify. */
  roofAgeMin: z.coerce.number().int().min(0).max(150).default(OSCEOLA.thresholds.roofAgeYears),
  /** Only properties with at least one open roofing permit. */
  openPermitsOnly: boolParam.default(false),
  /** Only roofs at/over the threshold; hides parcels that qualify by open permit alone. */
  agedRoofsOnly: boolParam.default(false),
  /** Only properties whose oldest open roofing permit is at least this many years old. */
  longOpenYears: nullableNumParam(0, 50).default(null),
  ownerOutOfState: boolParam.default(false),
  /** Only properties with no sale in at least this many years. */
  noSaleYears: nullableNumParam(0, 100).default(null),
  /** Only parcels where some permit has a BBB-rated contractor (`has_bbb_contractor`). */
  ratedContractorOnly: boolParam.default(false),
  propertyType: z.enum(["residential", "commercial", "all"]).default("all"),
  sort: z.enum(SORT_KEYS).default("priority"),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;
/** Untyped input (URL params, JSON bodies, tool args); validated by `searchParamsSchema`. */
export type SearchParamsInput = unknown;

/** Threshold used to classify a "long-open" permit (years -> days). */
export function longOpenDays(params: SearchParams): number {
  return Math.round((params.longOpenYears ?? OSCEOLA.thresholds.longOpenPermitYears) * 365);
}

/** WHERE clause shared by the row query and the count query. */
function whereClause(p: SearchParams): string {
  const center = { lat: num(p.lat), lng: num(p.lng) };
  const radius = num(p.radiusMiles, { min: RADIUS_MILES.min, max: RADIUS_MILES.max, decimals: 2 });
  const clauses = [
    "latitude IS NOT NULL",
    bboxSql(center, radius),
    `${haversineSql(center)} <= ${radius}`,
  ];
  const roofAge = int(p.roofAgeMin, { min: 0, max: 150 });
  const leadSignals = [`roof_age_years >= ${roofAge}`, "open_roof_permit_count > 0"];
  if (p.agedRoofsOnly) {
    clauses.push(`roof_age_years >= ${roofAge}`);
  } else if (p.openPermitsOnly || p.longOpenYears !== null) {
    clauses.push("open_roof_permit_count > 0");
  } else {
    clauses.push(`(${leadSignals.join(" OR ")})`);
  }
  if (p.longOpenYears !== null) clauses.push(`oldest_open_roof_permit_days >= ${longOpenDays(p)}`);
  if (p.ownerOutOfState) clauses.push("owner_out_of_state = true");
  if (p.ratedContractorOnly) clauses.push("has_bbb_contractor = true");
  if (p.noSaleYears !== null)
    clauses.push(`years_since_sale >= ${num(p.noSaleYears, { min: 0, max: 100, decimals: 1 })}`);
  const type = oneOf(p.propertyType, ["residential", "commercial", "all"] as const);
  if (type !== "all") clauses.push(`property_type = '${type}'`);
  return clauses.join("\n  AND ");
}

function orderClause(sort: SortKey): string {
  switch (oneOf(sort, SORT_KEYS)) {
    case "roof_age":
      return "roof_age_years DESC NULLS LAST, distance_miles ASC";
    case "days_open":
      return "oldest_open_roof_permit_days DESC NULLS LAST, roof_age_years DESC NULLS LAST";
    case "value":
      return "market_value DESC NULLS LAST";
    case "distance":
      return "distance_miles ASC";
    case "priority":
    default:
      return "CASE WHEN open_roof_permit_count > 0 THEN 0 ELSE 1 END, oldest_open_roof_permit_days DESC NULLS LAST, roof_age_years DESC NULLS LAST, distance_miles ASC";
  }
}

const CANDIDATE_COLUMNS = [
  "request_identifier",
  "parcel_identifier",
  "address_street",
  "address_city",
  "address_zip",
  "latitude",
  "longitude",
  "property_type",
  "property_usage_type",
  "built_year",
  "effective_year",
  "roof_age_years",
  "roof_age_basis",
  "last_roof_permit_date",
  "open_roof_permit_count",
  "oldest_open_roof_permit_days",
  "permit_count",
  "has_bbb_contractor",
  "owner_name",
  "owner_mail_state",
  "owner_out_of_state",
  "owner_out_of_county",
  "owner_occupied",
  "last_sale_date",
  "years_since_sale",
  "market_value",
  "source_urls",
] as const;

/** Build the radius lead-candidate query (rows). */
export function buildCandidateQuery(input: SearchParamsInput): {
  sql: string;
  params: SearchParams;
} {
  const p = searchParamsSchema.parse(input);
  const center = { lat: num(p.lat), lng: num(p.lng) };
  const sql =
    `SELECT ${CANDIDATE_COLUMNS.join(", ")},\n  ${haversineSql(center)} AS distance_miles\nFROM properties\nWHERE ${whereClause(p)}\n` +
    `ORDER BY ${orderClause(p.sort)}\nLIMIT ${int(p.limit, { min: 1, max: 1000 })}`;
  return { sql, params: p };
}

/** Build the companion count query (totals and per-signal counts for the same filters). */
export function buildCandidateCountQuery(input: SearchParamsInput): {
  sql: string;
  params: SearchParams;
} {
  const p = searchParamsSchema.parse(input);
  const roofAge = int(p.roofAgeMin, { min: 0, max: 150 });
  const sql =
    `SELECT count(*) AS total,\n` +
    `  count(*) FILTER (WHERE open_roof_permit_count > 0) AS open_permits,\n` +
    `  count(*) FILTER (WHERE open_roof_permit_count > 0 AND oldest_open_roof_permit_days >= ${longOpenDays(p)}) AS long_open_permits,\n` +
    `  count(*) FILTER (WHERE roof_age_years >= ${roofAge}) AS aged_roofs,\n` +
    `  count(*) FILTER (WHERE owner_out_of_state) AS out_of_state_owners,\n` +
    `  count(*) FILTER (WHERE has_bbb_contractor) AS bbb_parcels\n` +
    `FROM properties\nWHERE ${whereClause(p)}`;
  return { sql, params: p };
}

/** Build the single-property detail query by parcel key (`request_identifier`). */
export function buildPropertyByIdQuery(parcelId: string): string {
  const lit = idLiteral(parcelId);
  return `SELECT * FROM properties WHERE request_identifier = ${lit} OR parcel_identifier = ${lit} LIMIT 1`;
}

/** Build a multi-property query used when creating leads from a selection. */
export function buildPropertiesByIdsQuery(parcelIds: readonly string[]): string {
  if (parcelIds.length === 0 || parcelIds.length > 100)
    throw new RangeError("Provide 1-100 parcel ids");
  const list = parcelIds.map(idLiteral).join(", ");
  return `SELECT * FROM properties WHERE request_identifier IN (${list}) OR parcel_identifier IN (${list}) LIMIT ${parcelIds.length}`;
}
