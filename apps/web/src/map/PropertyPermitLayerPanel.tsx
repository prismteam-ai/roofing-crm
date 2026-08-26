import { resolvePropertyPermitOpenYears } from "@roofing-crm-challenge/shared";

import type { JSX } from "react";

/**
 * One permit row on the CRM property / permit-layer contract.
 *
 * Mirrors the API `PropertyPermitDetail` shape so the SPA can render layer
 * chrome before the drawer story wires live `properties.get` responses.
 */
export interface PropertyPermitDetail {
  permitId: string | null;
  permitType: string | null;
  status: string | null;
  issuedDate: string | null;
  openedDate: string | null;
  closedDate: string | null;
  description: string | null;
  contractorName: string | null;
  sourceSystem?: string | null;
  provenanceClass?:
    | "smartgov_ucc"
    | "county_gis_well"
    | "county_gis_sewage"
    | "county_gis_act247"
    | "synthetic_demo"
    | null;
}

/**
 * Honest empty copy when published `permits[]` is empty (Lee unserved path).
 *
 * States that empty is real data — not a reason to invent close dates.
 */
export const PROPERTY_PERMIT_LAYER_EMPTY_COPY =
  "No roofing permits published for this street.";

/** Matches roof / roofing / shingle / membrane wording on type or description. */
const ROOFING_PROPERTY_PERMIT_TYPE_PATTERN = /roof/i;

/**
 * Whether a permit belongs on the long-open roofing lead layer.
 *
 * Non-roofing permits are detail-only; the layer keeps `/roof/i` matches.
 */
export function isRoofingPropertyPermitDetail(
  permitDetail: PropertyPermitDetail,
): boolean {
  const typeText = permitDetail.permitType ?? "";
  const descriptionText = permitDetail.description ?? "";
  return (
    ROOFING_PROPERTY_PERMIT_TYPE_PATTERN.test(typeText) ||
    ROOFING_PROPERTY_PERMIT_TYPE_PATTERN.test(descriptionText)
  );
}

/**
 * Selects roofing permit rows for the long-open lead layer.
 */
export function selectRoofingPropertyPermitDetails(
  permitDetails: PropertyPermitDetail[],
): PropertyPermitDetail[] {
  return permitDetails.filter(isRoofingPropertyPermitDetail);
}

/**
 * Formats the closed-date label for permit layer chrome.
 *
 * Null stays an honest “no close date” label — never a fabricated ISO date.
 */
export function formatPropertyPermitClosedDateLabel(closedDate: string | null): string {
  if (closedDate === null || closedDate.trim() === "") {
    return "No close date on file";
  }
  return `Closed ${closedDate}`;
}

/**
 * Formats how long an open permit has been active from published start dates.
 */
export function formatPropertyPermitOpenDurationLabel(arguments_: {
  openedDate: string | null;
  issuedDate: string | null;
  closedDate: string | null;
  currentUtcYear: number;
}): string {
  const openYears = resolvePropertyPermitOpenYears({
    openedDate: arguments_.openedDate,
    issuedDate: arguments_.issuedDate,
    closedDate: arguments_.closedDate,
    currentUtcYear: arguments_.currentUtcYear,
  });
  if (openYears === null) {
    return "Permit open, no issue date on file";
  }
  if (openYears === 1) {
    return "Permit open ~1 yr";
  }
  return `Permit open ~${String(openYears)} yr`;
}

function formatPropertyPermitProvenanceLabel(
  provenanceClass: PropertyPermitDetail["provenanceClass"],
): string | null {
  switch (provenanceClass) {
    case "synthetic_demo":
      return "Demo data";
    case "county_gis_well":
      return "County GIS well";
    case "county_gis_sewage":
      return "County GIS sewage";
    case "county_gis_act247":
      return "County GIS Act 247 planning";
    case "smartgov_ucc":
      return "SmartGov UCC candidate";
    default:
      return null;
  }
}

/**
 * Builds one scannable permit row for the property drawer and map layer.
 */
export function formatPropertyPermitLayerRowCopy(
  permit: PropertyPermitDetail,
  currentUtcYear: number = new Date().getUTCFullYear(),
): string {
  const segments: string[] = [permit.permitType ?? "Permit"];
  const closedDate =
    permit.closedDate !== null && permit.closedDate.trim().length > 0
      ? permit.closedDate
      : null;

  if (closedDate !== null) {
    if (
      permit.status !== null &&
      permit.status.trim().length > 0 &&
      permit.status.trim().toLowerCase() !== "open"
    ) {
      segments.push(permit.status);
    }
    segments.push(formatPropertyPermitClosedDateLabel(closedDate));
  } else {
    const openStateLabel = formatPropertyPermitOpenDurationLabel({
      openedDate: permit.openedDate,
      issuedDate: permit.issuedDate,
      closedDate: permit.closedDate,
      currentUtcYear,
    });
    if (openStateLabel.includes("no issue date")) {
      segments.push(openStateLabel);
    } else {
      segments.push(`${openStateLabel}, no close date on file`);
    }
  }

  const contractorName = permit.contractorName?.trim();
  if (contractorName !== undefined && contractorName.length > 0) {
    segments.push(contractorName);
  }

  const provenanceLabel = formatPropertyPermitProvenanceLabel(permit.provenanceClass);
  if (provenanceLabel !== null) {
    segments.push(provenanceLabel);
  }

  return segments.join(" · ");
}

/**
 * Props for the long-open roofing permit layer panel.
 */
export interface PropertyPermitLayerPanelProps {
  /** Published permit rows (may be empty on Lee). */
  permits: PropertyPermitDetail[];
  /** UTC year used for open-duration labels (defaults to current year). */
  currentUtcYear?: number;
}

/**
 * Renders roofing permits for the map layer, or honest empty when none exist.
 *
 * Filters to `/roof/i` type/description; shows status and close-date honesty
 * without inventing dates for null `closedDate`.
 */
export function PropertyPermitLayerPanel({
  permits,
  currentUtcYear = new Date().getUTCFullYear(),
}: PropertyPermitLayerPanelProps): JSX.Element {
  const roofingPermits = selectRoofingPropertyPermitDetails(permits);

  if (roofingPermits.length === 0) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="property-permit-layer-empty"
        role="status"
      >
        {PROPERTY_PERMIT_LAYER_EMPTY_COPY}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5" data-testid="property-permit-layer-list">
      {roofingPermits.map((permit, index) => {
        const rowKey = permit.permitId ?? `permit-${index}`;
        return (
          <li
            key={rowKey}
            className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs"
            data-testid={`property-permit-layer-row-${rowKey}`}
          >
            {formatPropertyPermitLayerRowCopy(permit, currentUtcYear)}
          </li>
        );
      })}
    </ul>
  );
}
