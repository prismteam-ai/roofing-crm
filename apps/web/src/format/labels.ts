// Plain-language labels for the contract's enum codes (contract/v1 COLUMN_ENUMS, as carried on
// the CRM index rows). Every closed enum has a full map (`satisfies Record<...>` makes tsc fail
// on a missing code); an open string (property usage, a future status class) is humanized,
// never shown raw.
import type { CrmProperty } from "@crm/index-schema";
import { formatDate } from "./date.js";

/** `SingleFamily` / `built_year` / `MOBILE_HOME` → `Single family` / `Built year` / `Mobile home`. */
export function humanizeCode(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== "");
  const text = words.join(" ");
  return text === "" ? code : text.charAt(0).toUpperCase() + text.slice(1);
}

type RoofAgeBasis = CrmProperty["roofAgeBasis"];
type RoofAgeConfidence = CrmProperty["roofAgeConfidence"];

export const ROOF_AGE_BASIS_LABELS = Object.freeze({
  permit: "Last reroof permit",
  new_construction: "New construction (year built)",
  built_year: "Year built (no reroof permit found)",
  unknown: "Basis unknown",
} satisfies Record<RoofAgeBasis, string>);

export const ROOF_AGE_CONFIDENCE_LABELS = Object.freeze({
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
} satisfies Record<RoofAgeConfidence, string>);

export function roofAgeBasisLabel(code: RoofAgeBasis): string {
  return ROOF_AGE_BASIS_LABELS[code];
}

/** Property types with no building on them: there is no roof, so "no roof date found" would read as
 *  missing data when nothing is missing (Run 3: 34,471 vacant land and 16,884 land parcels). */
const NO_BUILDING_TYPES = new Set(["VacantLand", "LandParcel"]);

/** The wording for an empty roof age. For a record with no building (and the contract's
 *  `no_roof_date` reason) it says so; for anything else it is undefined and the contract's own
 *  reason label stands. */
export function roofAgeGapLabel(
  propertyType: string | null | undefined,
  reason: string,
): string | undefined {
  return reason === "no_roof_date" && propertyType != null && NO_BUILDING_TYPES.has(propertyType)
    ? "No building on this parcel, so no roof age"
    : undefined;
}

/** The roof age with its basis beside it where the age is only a stand-in: Task A publishes no
 *  roof date from TCAD, so a "built year" age is the age of the building, not of a roof
 *  (Task A, 2026-10-26: keep "estimated from year built" visible next to the age). */
export function roofAgeText(years: number, basis: RoofAgeBasis | null | undefined): string {
  const estimated = basis === "built_year" || basis === "new_construction";
  return estimated ? `${String(years)} yrs · estimated from year built` : `${String(years)} yrs`;
}

export function roofAgeConfidenceLabel(code: RoofAgeConfidence): string {
  return ROOF_AGE_CONFIDENCE_LABELS[code];
}

const PERMIT_STATUS_SHORT: Readonly<Record<string, string>> = {
  open: "Open",
  stalled: "Stalled",
  closed: "Closed",
};

/** A permit with a final date is finished, whatever its class says: Task A classes a finaled
 *  permit that has no status as "stalled". Says so, and why the class is not trusted: `Finaled
 *  Apr 15, 1991 (status not in source)`. Null when the permit is not an open/stalled one with a
 *  final date. */
export function finaledPermitLabel(
  statusClass: string | null,
  finalDate: string | null | undefined,
): string | null {
  if (statusClass !== "open" && statusClass !== "stalled") return null;
  if (finalDate === null || finalDate === undefined || finalDate === "") return null;
  const when = formatDate(finalDate) ?? "date unreadable";
  return statusClass === "stalled"
    ? `Finaled ${when} (status not in source)`
    : `Finaled ${when} (source status: open)`;
}

/** Short status for chips and legends: `Open`, `Stalled`, `Closed`; `Finaled …` when the permit
 *  has a final date. */
export function permitStatusShortLabel(
  statusClass: string | null,
  finalDate?: string | null,
): string {
  const finaled = finaledPermitLabel(statusClass, finalDate);
  if (finaled !== null) return finaled;
  if (statusClass === null) return "Status not published";
  return PERMIT_STATUS_SHORT[statusClass] ?? humanizeCode(statusClass);
}

/** Full status for the drawer: stalled is labelled as derived (design-review-log row 6); a
 *  permit with a final date is labelled as finaled, never as stalled. */
export function permitStatusLabel(statusClass: string | null, finalDate?: string | null): string {
  const finaled = finaledPermitLabel(statusClass, finalDate);
  if (finaled !== null) return finaled;
  if (statusClass === "stalled") return "Stalled · derived: no status in source";
  return permitStatusShortLabel(statusClass);
}

const CONTRACTOR_RESOLUTION: Readonly<Record<string, string>> = {
  resolved: "Resolved",
  unresolved: "Unresolved",
};

export function contractorResolutionLabel(code: string | null): string {
  if (code === null) return "Contractor resolution not published";
  return CONTRACTOR_RESOLUTION[code] ?? humanizeCode(code);
}

export const COORDINATE_SOURCE_LABELS = Object.freeze({
  gis_centroid: "Parcel centre (GIS)",
  address_point: "Austin address point",
  permit_point: "Permit location",
  none: "No coordinates",
} satisfies Record<CrmProperty["coordinateSource"], string>);

export function coordinateSourceLabel(code: CrmProperty["coordinateSource"]): string {
  return COORDINATE_SOURCE_LABELS[code];
}

export interface PropertyKind {
  readonly label: string;
  /** Material Symbols glyph for the kind. */
  readonly icon: "home" | "storefront" | "domain" | "help";
  /** False when the usage type is not published (the label then says so). */
  readonly published: boolean;
}

const COMMERCIAL = /commercial|retail|office|industrial|warehouse|store|business/i;
const RESIDENTIAL = /residential|family|home|house|duplex|condo|townhouse|apartment|dwelling/i;

/**
 * The card/drawer type line (E-51): Residential / Commercial comes from the published
 * `property_usage_type`. `property_type` is the lexicon's structure form (for example
 * `Building`), which is not what the design means by type, so it is never shown in its place;
 * a null usage reads "Type not published" (E-93).
 */
export function propertyKind(
  usageType: string | null,
  _structureType?: string | null,
): PropertyKind {
  if (usageType === null || usageType.trim() === "") {
    return { label: "Type not published", icon: "help", published: false };
  }
  const label = humanizeCode(usageType);
  const icon = COMMERCIAL.test(usageType)
    ? "storefront"
    : RESIDENTIAL.test(usageType)
      ? "home"
      : "domain";
  return { label, icon, published: true };
}
