import type { LeadRecord } from "@roofing-crm-challenge/shared";

/**
 * Map marker outreach state for a roof in the current radius.
 *
 * Prospect is the default linen mark. Active leads read as saved; archived
 * leads read as cooled off, not hot prospects.
 */
export type PlatRoofMarkerLeadState = "prospect" | "lead" | "archived";

/**
 * Resolves marker outreach state for one property from active and archived leads.
 */
export function resolvePlatRoofMarkerLeadState(arguments_: {
  propertyId: string;
  activeLeadRecords: LeadRecord[];
  archivedLeadRecords: LeadRecord[];
}): PlatRoofMarkerLeadState {
  const { propertyId, activeLeadRecords, archivedLeadRecords } = arguments_;

  if (
    activeLeadRecords.some(
      (leadRecord) =>
        leadRecord.propertyId === propertyId && leadRecord.status !== "archived",
    )
  ) {
    return "lead";
  }

  if (archivedLeadRecords.some((leadRecord) => leadRecord.propertyId === propertyId)) {
    return "archived";
  }

  return "prospect";
}

/**
 * Builds a property-id lookup for map marker styling.
 */
export function buildLeadMarkerStateByPropertyId(arguments_: {
  activeLeadRecords: LeadRecord[];
  archivedLeadRecords: LeadRecord[];
}): Readonly<Record<string, PlatRoofMarkerLeadState>> {
  const { activeLeadRecords, archivedLeadRecords } = arguments_;
  const leadMarkerStateByPropertyId: Record<string, PlatRoofMarkerLeadState> = {};

  for (const leadRecord of activeLeadRecords) {
    if (leadRecord.status === "archived") {
      continue;
    }
    leadMarkerStateByPropertyId[leadRecord.propertyId] = "lead";
  }

  for (const leadRecord of archivedLeadRecords) {
    if (leadMarkerStateByPropertyId[leadRecord.propertyId] !== undefined) {
      continue;
    }
    leadMarkerStateByPropertyId[leadRecord.propertyId] = "archived";
  }

  return leadMarkerStateByPropertyId;
}
