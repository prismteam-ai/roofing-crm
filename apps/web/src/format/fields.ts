// Plain-language names for contract columns (snake_case, contract/v1) and the CRM index's
// camelCase keys, used wherever a missing-data reason names the fields it covers. The reason
// wording itself always comes from the contract's closed list (`@crm/oracle-contract`'s
// `missingLabel`), never retyped here.
import { missingLabel, type MissingReason } from "@crm/oracle-contract";
import { humanizeCode } from "./labels.js";

export const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  unnormalized_address: "Street address",
  city_name: "City",
  postal_code: "ZIP code",
  owner_mailing_postal_code: "Owner mailing ZIP",
  owner_mailing_state_code: "Owner mailing state",
  owner_area_class: "Owner area",
  owner_is_out_of_area: "Out-of-area owner",
  owner_kind: "Owner kind",
  owner_name: "Owner name",
  latitude: "Latitude",
  longitude: "Longitude",
  lat_lon: "Coordinates",
  coordinate_source: "Coordinate source",
  property_type: "Property type",
  property_usage_type: "Property use",
  property_structure_built_year: "Year built",
  roof_age_years: "Roof age",
  roof_age_basis: "Roof-age basis",
  roof_age_confidence: "Roof-age confidence",
  roof_date: "Roof date",
  is_long_tenure: "Long tenure",
  tenure_years: "Tenure",
  tenure_basis: "Tenure basis",
  last_ownership_transfer_date: "Last sale date",
  permit_number: "Permit number",
  improvement_type: "Work type",
  improvement_action: "Work action",
  improvement_status: "Permit status",
  status_class: "Permit status",
  status_raw: "Status as printed",
  issue_date: "Issue date",
  final_date: "Final date",
  expiry_date: "Expiry date",
  permit_close_date: "Close date",
  final_inspection_date: "Final inspection date",
  open_days: "Open duration",
  description: "Permit description",
  work_class_raw: "Work class",
  jurisdiction: "Jurisdiction",
  contractor_name_raw: "Contractor name as printed",
  contractor_name_as_printed: "Contractor name as printed",
  contractor_resolution: "Contractor match",
  contractor_company_cid: "Contractor company",
  bbb_rating: "BBB rating",
  bbb_status: "BBB status",
  bbb_status_reason: "BBB status reason",
  bbb_url: "BBB link",
  source_url: "Source link",
  captured_at: "Captured at",
  request_identifier: "TCAD account",
  parcel_identifier: "Parcel id",
});

/** `roofAgeYears` → `roof_age_years`. */
function toSnake(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** The plain name of a field; unknown fields are humanized, never shown raw. */
export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? FIELD_LABELS[toSnake(field)] ?? humanizeCode(field);
}

/** Lower-cases the first letter for mid-sentence use, except for acronyms (`ZIP code`). */
function midSentence(label: string): string {
  const second = label.charAt(1);
  if (second !== "" && second === second.toUpperCase() && /[A-Z]/.test(second)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** `Street address, city, ZIP code` — one readable phrase for a list of fields. */
export function fieldList(fields: readonly string[]): string {
  return fields.map((f, i) => (i === 0 ? fieldLabel(f) : midSentence(fieldLabel(f)))).join(", ");
}

/** Owner columns whose `no_owner_record` entry covers two cases (§25.025 confidential owners and
 *  names Task A's splitter could not parse), so "no owner on record" is wrong for both. */
const OWNER_FIELDS = new Set(["owner_name", "owner_kind", "owner_area_class"]);

/** The contract's label for one missing entry; an unknown reason is humanized, never thrown. The
 *  field decides the wording where the vendored label is wrong for it (ADR-07 leaves the vendored
 *  table as it is; the screen says what is known). */
export function missingReasonText(field: string, reason: string): string {
  const column = toSnake(field);
  if (reason === "no_owner_record" && OWNER_FIELDS.has(column)) {
    return "Owner not published (confidential or name not parsed)";
  }
  // Run 3: 10,886 permits printed no contractor at all, so "not matched to a company" misleads.
  if (reason === "contractor_unresolved" && column === "contractor_name_as_printed") {
    return "No contractor printed on the permit";
  }
  // Run 3: a finaled or closed permit has no open duration; say so in the permit's own terms.
  if (reason === "not_open" && column === "open_days") return "Not open (finaled)";
  try {
    return missingLabel(column, reason as MissingReason);
  } catch {
    return humanizeCode(reason);
  }
}

/** `city, ZIP code, property use` — every field lower-cased for mid-sentence use (bullet text). */
export function fieldListInline(fields: readonly string[]): string {
  return fields.map((f) => midSentence(fieldLabel(f))).join(", ");
}

export interface MissingGroup {
  readonly reason: string;
  readonly reasonLabel: string;
  /** The raw field names (kept for `data-*` hooks and tests, never displayed). */
  readonly fields: readonly string[];
  /** The plain-language list to display. */
  readonly fieldsLabel: string;
  /** The same fields, each lower-cased, for "reason: city, ZIP code" bullets. */
  readonly fieldsInline: string;
}

/** A row's `missing` entries grouped by reason, in first-seen order. */
export function groupMissing(
  entries: readonly { readonly field: string; readonly reason: string }[],
): MissingGroup[] {
  // Grouped by reason AND wording: one reason can read differently per field (an owner field's
  // `no_owner_record`), so the label is decided per field and never taken from the first one.
  const groups = new Map<string, { reason: string; label: string; fields: string[] }>();
  for (const entry of entries) {
    const label = missingReasonText(entry.field, entry.reason);
    const key = `${entry.reason}|${label}`;
    const group = groups.get(key) ?? { reason: entry.reason, label, fields: [] };
    group.fields.push(entry.field);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    reason: group.reason,
    reasonLabel: group.label,
    fields: group.fields,
    fieldsLabel: fieldList(group.fields),
    fieldsInline: fieldListInline(group.fields),
  }));
}
