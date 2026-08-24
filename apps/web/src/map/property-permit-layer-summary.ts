/**
 * Long-open roofing permit summaries for the map permit layer.
 *
 * Uses published permit dates only — never invents close dates or ranks closed
 * permits as long-open.
 */
import { resolvePropertyPermitOpenYears } from "@roofing-crm-challenge/shared";

import {
  isRoofingPropertyPermitDetail,
  type PropertyPermitDetail,
} from "./PropertyPermitLayerPanel";

/** Default minimum open years for the long-open roofing permit layer. */
export const DEFAULT_MIN_OPEN_PERMIT_YEARS = 5;

/**
 * Visible HUD label for the long-open permit filter (checkbox + slider row).
 *
 * Example: “Permit open for 5+ yr”.
 */
export function formatPropertyPermitLayerFilterLabel(
  minOpenPermitYears: number,
): string {
  return `Permit open for ${String(minOpenPermitYears)}+ yr`;
}

/**
 * Maximum properties to scan with properties.get per radius refresh.
 */
export const PERMIT_LAYER_CANDIDATE_SCAN_LIMIT = 25;

/**
 * Selects roofing permits that qualify as long-open for the lead layer.
 */
export function selectLongOpenRoofingPropertyPermitDetails(arguments_: {
  permitDetails: PropertyPermitDetail[];
  minOpenPermitYears: number;
  currentUtcYear: number;
}): PropertyPermitDetail[] {
  return arguments_.permitDetails
    .filter((permitDetail) => {
      if (!isRoofingPropertyPermitDetail(permitDetail)) {
        return false;
      }
      const openYears = resolvePropertyPermitOpenYears({
        openedDate: permitDetail.openedDate,
        issuedDate: permitDetail.issuedDate,
        closedDate: permitDetail.closedDate,
        currentUtcYear: arguments_.currentUtcYear,
      });
      return openYears !== null && openYears >= arguments_.minOpenPermitYears;
    })
    .sort((leftPermit, rightPermit) => {
      const leftOpenYears =
        resolvePropertyPermitOpenYears({
          openedDate: leftPermit.openedDate,
          issuedDate: leftPermit.issuedDate,
          closedDate: leftPermit.closedDate,
          currentUtcYear: arguments_.currentUtcYear,
        }) ?? -1;
      const rightOpenYears =
        resolvePropertyPermitOpenYears({
          openedDate: rightPermit.openedDate,
          issuedDate: rightPermit.issuedDate,
          closedDate: rightPermit.closedDate,
          currentUtcYear: arguments_.currentUtcYear,
        }) ?? -1;
      return rightOpenYears - leftOpenYears;
    });
}

/**
 * Returns the longest open duration among long-open roofing permits, or null.
 */
export function resolveMaxLongOpenRoofingPermitYears(arguments_: {
  permitDetails: PropertyPermitDetail[];
  minOpenPermitYears: number;
  currentUtcYear: number;
}): number | null {
  const longOpenPermits = selectLongOpenRoofingPropertyPermitDetails(arguments_);
  if (longOpenPermits.length === 0) {
    return null;
  }
  const firstPermit = longOpenPermits[0];
  if (firstPermit === undefined) {
    return null;
  }
  return resolvePropertyPermitOpenYears({
    openedDate: firstPermit.openedDate,
    issuedDate: firstPermit.issuedDate,
    closedDate: firstPermit.closedDate,
    currentUtcYear: arguments_.currentUtcYear,
  });
}

/**
 * Formats the list-row chip for a long-open roofing permit signal.
 */
export function formatLongOpenPermitListChipLabel(openYears: number): string {
  if (openYears === 1) {
    return "Permit open · 1 yr";
  }
  return `Permit open · ${String(openYears)} yr`;
}
