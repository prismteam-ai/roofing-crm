/**
 * Row shapes returned by the MCP query views, plus coercion helpers. DuckDB BIGINT
 * columns arrive as strings over MCP, so every numeric read goes through `toNum`.
 *
 * @module queries/types
 */

/** Lead signal used for marker colour and priority. */
export type LeadSignal = "long_open_permit" | "open_permit" | "aged_roof" | "none";

/** Coerce a possibly-string numeric to number (or null). */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce to string or null. */
export function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

/** Coerce to boolean or null. */
export function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return null;
}

/** Normalised property candidate used by the map, list, drawer and lead mapper. */
export interface PropertyCandidate {
  parcelId: string;
  parcelNumber: string | null;
  address: string;
  street: string | null;
  city: string | null;
  zip: string | null;
  lat: number;
  lng: number;
  propertyType: string | null;
  usageType: string | null;
  builtYear: number | null;
  effectiveYear: number | null;
  roofAgeYears: number | null;
  roofAgeBasis: "roof_permit" | "built_year" | "unknown";
  lastRoofPermitDate: string | null;
  openRoofPermitCount: number;
  oldestOpenRoofPermitDays: number | null;
  permitCount: number;
  hasBbbContractor: boolean | null;
  /** Best BBB rating among the parcel's rated contractors (filled by the search service). */
  bbbBestRating: string | null;
  bbbMatchMethod: string | null;
  bbbContractorName: string | null;
  ownerName: string | null;
  ownersText: string | null;
  ownerMailCity: string | null;
  ownerMailState: string | null;
  ownerOutOfState: boolean | null;
  ownerOutOfCounty: boolean | null;
  ownerOccupied: boolean | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  yearsSinceSale: number | null;
  marketValue: number | null;
  assessedValue: number | null;
  livableFloorArea: number | null;
  lotSizeAcre: number | null;
  subdivision: string | null;
  sourceUrls: string[];
  distanceMiles: number | null;
  signal: LeadSignal;
}

/** Normalised permit row shown in the property drawer and snapshotted into leads. */
export interface PermitRecord {
  permitNumber: string;
  parcelNumber: string | null;
  improvementType: string | null;
  status: string | null;
  action: string | null;
  isRoofing: boolean;
  isOpen: boolean;
  daysOpen: number | null;
  issueDate: string | null;
  closeDate: string | null;
  finalInspectionDate: string | null;
  expirationDate: string | null;
  description: string | null;
  estimatedJobValue: number | null;
  issuingAgency: string | null;
  sourceSystem: string | null;
  contractorName: string | null;
  contractorQualifier: string | null;
  contractorPhone: string | null;
  contractorLicense: string | null;
  bbbRating: string | null;
  bbbAccredited: boolean | null;
  bbbProfileUrl: string | null;
  bbbMatchMethod: string | null;
  sourceUrl: string | null;
}

/** Derive the lead signal from the roofing columns. */
export function leadSignal(
  row: {
    openRoofPermitCount: number;
    oldestOpenRoofPermitDays: number | null;
    roofAgeYears: number | null;
  },
  thresholds: { roofAgeYears: number; longOpenDays: number },
): LeadSignal {
  if (row.openRoofPermitCount > 0 && (row.oldestOpenRoofPermitDays ?? 0) >= thresholds.longOpenDays)
    return "long_open_permit";
  if (row.openRoofPermitCount > 0) return "open_permit";
  if ((row.roofAgeYears ?? -1) >= thresholds.roofAgeYears) return "aged_roof";
  return "none";
}

/** Map a raw `properties` view row to a `PropertyCandidate`. */
export function mapPropertyRow(
  row: Record<string, unknown>,
  thresholds: { roofAgeYears: number; longOpenDays: number },
): PropertyCandidate {
  const street = toStr(row.address_street);
  const city = toStr(row.address_city);
  const zip = toStr(row.address_zip);
  const basisRaw = toStr(row.roof_age_basis);
  const roofAgeBasis: PropertyCandidate["roofAgeBasis"] =
    basisRaw === "roof_permit" || basisRaw === "built_year" ? basisRaw : "unknown";
  const base = {
    openRoofPermitCount: toNum(row.open_roof_permit_count) ?? 0,
    oldestOpenRoofPermitDays: toNum(row.oldest_open_roof_permit_days),
    roofAgeYears: toNum(row.roof_age_years),
  };
  return {
    parcelId: String(row.request_identifier ?? row.parcel_identifier ?? row.property_id ?? ""),
    parcelNumber: toStr(row.parcel_identifier),
    address: [street, city, zip].filter(Boolean).join(", ") || "(no situs address)",
    street,
    city,
    zip,
    lat: toNum(row.latitude) ?? 0,
    lng: toNum(row.longitude) ?? 0,
    propertyType: toStr(row.property_type),
    usageType: toStr(row.property_usage_type),
    builtYear: toNum(row.built_year),
    effectiveYear: toNum(row.effective_year),
    roofAgeYears: base.roofAgeYears,
    roofAgeBasis,
    lastRoofPermitDate: toStr(row.last_roof_permit_date),
    openRoofPermitCount: base.openRoofPermitCount,
    oldestOpenRoofPermitDays: base.oldestOpenRoofPermitDays,
    permitCount: toNum(row.permit_count) ?? 0,
    hasBbbContractor: toBool(row.has_bbb_contractor),
    bbbBestRating: null,
    bbbMatchMethod: null,
    bbbContractorName: null,
    ownerName: toStr(row.owner_name),
    ownersText: toStr(row.owners_text),
    ownerMailCity: toStr(row.owner_mail_city),
    ownerMailState: toStr(row.owner_mail_state),
    ownerOutOfState: toBool(row.owner_out_of_state),
    ownerOutOfCounty: toBool(row.owner_out_of_county),
    ownerOccupied: toBool(row.owner_occupied),
    lastSaleDate: toStr(row.last_sale_date),
    lastSalePrice: toNum(row.last_sale_price),
    yearsSinceSale: toNum(row.years_since_sale),
    marketValue: toNum(row.market_value),
    assessedValue: toNum(row.assessed_value),
    livableFloorArea: toNum(row.livable_floor_area),
    lotSizeAcre: toNum(row.lot_size_acre),
    subdivision: toStr(row.subdivision),
    sourceUrls: [
      ...new Set(
        String(row.source_urls ?? "")
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ],
    distanceMiles: toNum(row.distance_miles),
    signal: leadSignal(base, thresholds),
  };
}

/** Map a raw `permits` view row to a `PermitRecord`. */
export function mapPermitRow(row: Record<string, unknown>): PermitRecord {
  return {
    permitNumber: String(row.permit_number ?? row.property_improvement_id ?? ""),
    parcelNumber: toStr(row.parcel_identifier),
    improvementType: toStr(row.improvement_type),
    status: toStr(row.improvement_status),
    action: toStr(row.improvement_action),
    isRoofing: toBool(row.is_roofing) ?? false,
    isOpen: toBool(row.is_open) ?? false,
    daysOpen: toNum(row.days_open),
    issueDate: toStr(row.permit_issue_date),
    closeDate: toStr(row.permit_close_date),
    finalInspectionDate: toStr(row.final_inspection_date),
    expirationDate: toStr(row.expiration_date),
    description: toStr(row.project_description) ?? toStr(row.description),
    estimatedJobValue: toNum(row.estimated_job_value),
    issuingAgency: toStr(row.issuing_agency),
    sourceSystem: toStr(row.source_system),
    contractorName: toStr(row.contractor_name),
    contractorQualifier: toStr(row.contractor_qualifier),
    contractorPhone: toStr(row.contractor_phone),
    contractorLicense: toStr(row.contractor_license),
    bbbRating: toStr(row.bbb_rating),
    bbbAccredited: toBool(row.bbb_accredited),
    bbbProfileUrl: toStr(row.bbb_profile_url),
    bbbMatchMethod: toStr(row.bbb_match_method),
    sourceUrl: toStr(row.source_url),
  };
}
