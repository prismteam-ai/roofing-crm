// Display wording shared by the result row, the Why panel and the property drawer, so one fact is
// worded in one place: tenure, source names, the address line, and the reason a permit field is
// empty. Every value is read from the row; nothing is derived or invented here.
import { openDurationLabel } from "@crm/domain";
import type { CrmPermit, CrmProperty, Missing } from "@crm/index-schema";
import { missingReasonText } from "./fields.js";

/** The contract's `is_long_tenure` is `tenure_years > 10` (columns.ts): strictly over, so exactly
 *  10 years is not long tenure. The filter chip, the drawer and the Why panel all read this. */
export const LONG_TENURE_OVER_YEARS = 10;

/** `Over 10 years` / `10 years or fewer`. */
export function tenureBandLabel(isLongTenure: boolean): string {
  return isLongTenure
    ? `Over ${String(LONG_TENURE_OVER_YEARS)} years`
    : `${String(LONG_TENURE_OVER_YEARS)} years or fewer`;
}

/** Source names used when a row does not carry a more specific one. */
export const SOURCE_PERMITS_LABEL = "Austin permits";
export const SOURCE_PARCELS_LABEL = "TCAD parcels";
/** BBB is never contacted: the lookup is blocked, so its source line says that. */
export const BBB_SOURCE_LABEL = "BBB: lookup blocked, not contacted";

/** `Austin permits` from the permit's own jurisdiction, else the named constant. */
export function permitsSourceLabel(permit?: Pick<CrmPermit, "jurisdiction"> | null): string {
  const jurisdiction = permit?.jurisdiction?.trim();
  if (jurisdiction === undefined || jurisdiction === "") return SOURCE_PERMITS_LABEL;
  return `${jurisdiction.charAt(0).toUpperCase()}${jurisdiction.slice(1)} permits`;
}

/** The first `missing` entry for any of the fields (snake_case, as the contract writes them). */
export function missingEntry(
  entries: readonly Missing[] | undefined,
  ...fields: readonly string[]
): Missing | undefined {
  return (entries ?? []).find((m) => fields.includes(m.field));
}

/** Shown when a field is empty and its row carries no entry for it. */
const NO_REASON = "no reason recorded";

export const ADDRESS_NOT_PUBLISHED = "Address not published in this run";

/** The street-address line: `unnormalized_address` as TCAD prints it (contract v1.2), shown as it
 *  is. A row without one (21 properties, or an index built before v1.2) says why from its own
 *  `missing` entry. */
export function addressLine(
  property: Pick<CrmProperty, "missingReasons"> & {
    readonly unnormalizedAddress?: string | null | undefined;
  },
): string {
  const address = property.unnormalizedAddress?.trim();
  if (address !== undefined && address !== "") return address;
  const entry = missingEntry(property.missingReasons, "unnormalized_address");
  if (entry === undefined || entry.reason === "not_in_export") return ADDRESS_NOT_PUBLISHED;
  return `Address not published · ${missingReasonText(entry.field, entry.reason)}`;
}

/** The open duration of a permit as text; when it is empty, the reason from the permit's own
 *  `missing` entry (`not_open` reads "Not open (finaled)"). */
export function openDurationText(
  permit: Pick<CrmPermit, "openDays"> & { readonly missingReasons?: readonly Missing[] },
): string {
  if (permit.openDays !== null) return openDurationLabel(permit.openDays);
  const entry = missingEntry(permit.missingReasons, "open_days");
  return entry === undefined
    ? `open duration not published (${NO_REASON})`
    : missingReasonText(entry.field, entry.reason);
}

/** Why a permit shows no contractor: the reason from its own `missing` entry. */
export function contractorReasonText(permit: {
  readonly missingReasons?: readonly Missing[] | undefined;
}): string {
  const entry = missingEntry(permit.missingReasons, "contractor_name_as_printed");
  return entry === undefined ? NO_REASON : missingReasonText(entry.field, entry.reason);
}

/** The BBB gap: the reason from the permit's `missing` entry for the rating or the status, else
 *  the row's `bbbStatusReason`, else "no reason recorded". */
export function bbbGapText(
  permit: Pick<CrmPermit, "bbbStatusReason"> & { readonly missingReasons?: readonly Missing[] },
): string {
  const entry = missingEntry(permit.missingReasons, "bbb_rating", "bbb_status");
  const reason = entry?.reason ?? permit.bbbStatusReason;
  return `BBB rating not available · ${
    reason === null || reason === undefined ? NO_REASON : missingReasonText("bbb_rating", reason)
  }`;
}

type AddressFields = {
  readonly unnormalizedAddress?: string | null | undefined;
};

/** The trimmed street address, or null when the row carries none. */
export function streetAddress(property: AddressFields): string | null {
  const address = property.unnormalizedAddress?.trim();
  return address === undefined || address === "" ? null : address;
}

/** The title of a property: its street address, else `TCAD {id}` (never an invented address). */
export function propertyTitle(
  property: AddressFields & { readonly requestIdentifier: string },
): string {
  return streetAddress(property) ?? `TCAD ${property.requestIdentifier}`;
}

/** The line under the title: `TCAD {id}` when the title is the address, else the reason the
 *  address is missing. */
export function propertySubtitle(
  property: AddressFields & Pick<CrmProperty, "missingReasons" | "requestIdentifier">,
): string {
  return streetAddress(property) === null
    ? addressLine(property)
    : `TCAD ${property.requestIdentifier}`;
}
