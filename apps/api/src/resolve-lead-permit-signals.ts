/**
 * Derives LeadRecord permit signals from published permit records at create time.
 *
 * A lead's `maxOpenPermitYears` and permit provenance must be recomputed
 * server-side from the same permit rows the drawer showed — never trusted from
 * the client. Weakest input wins: one synthetic permit taints the whole lead.
 */
import { resolvePropertyPermitOpenYears } from "@roofing-crm-challenge/shared";

import type { OraclePropertyPermitRecord } from "./routers/properties.js";

/**
 * Permit-derived inputs for the lead snapshot (open years + provenance).
 */
export interface LeadPermitSignals {
  maxOpenPermitYears: number | null;
  permitProvenanceClasses: Array<string | null | undefined>;
  /** Permit numbers the lead was actually stamped on (server-derived). */
  openPermitIds: string[];
  /** Contractor from the stamped permit rows, when published. */
  contractorName: string | null;
}

/** Signals when no permit rows are available (empty is the honest answer). */
export const EMPTY_LEAD_PERMIT_SIGNALS: LeadPermitSignals = {
  maxOpenPermitYears: null,
  permitProvenanceClasses: [],
  openPermitIds: [],
  contractorName: null,
};

/** Matches roof / roofing wording on permit type, improvement, or description. */
const ROOFING_PERMIT_RECORD_PATTERN = /roof/i;

/**
 * Whether a published permit record is an open roofing permit.
 *
 * Open means no published close date; roofing means `/roof/i` on type,
 * improvement type, or description — the same rule the drawer layer uses.
 */
export function isOpenRoofingPermitRecord(
  permitRecord: OraclePropertyPermitRecord,
): boolean {
  const closedDate = permitRecord.closedDate ?? null;
  if (closedDate !== null && closedDate.trim() !== "") {
    return false;
  }
  const typeText = permitRecord.permitType ?? "";
  const improvementText = permitRecord.improvementType ?? "";
  const descriptionText = permitRecord.description ?? "";
  return (
    ROOFING_PERMIT_RECORD_PATTERN.test(typeText) ||
    ROOFING_PERMIT_RECORD_PATTERN.test(improvementText) ||
    ROOFING_PERMIT_RECORD_PATTERN.test(descriptionText)
  );
}

/**
 * Computes lead permit signals from the permits selected at convert time.
 *
 * When the client named `permitIds`, only rows whose permit number appears in
 * that set count — those are the open permits the lead was qualified on. When
 * the client named none (direct API create, drawer without permits loaded),
 * the server stamps the open roofing permits it finds itself instead of
 * silently recording an empty snapshot. Open years follow the shared
 * published-date rule (closed or undated permits contribute null).
 */
export function resolveLeadPermitSignalsFromPermitRecords(arguments_: {
  permitRecords: OraclePropertyPermitRecord[];
  permitIds: string[];
  currentUtcYear: number;
}): LeadPermitSignals {
  const selectedPermitIds = new Set(arguments_.permitIds);
  const selectedPermitRecords =
    arguments_.permitIds.length > 0
      ? arguments_.permitRecords.filter(
          (permitRecord) =>
            permitRecord.permitNumber !== null &&
            permitRecord.permitNumber !== undefined &&
            selectedPermitIds.has(permitRecord.permitNumber),
        )
      : arguments_.permitRecords.filter(isOpenRoofingPermitRecord);

  let maxOpenPermitYears: number | null = null;
  const permitProvenanceClasses: Array<string | null | undefined> = [];
  const openPermitIds: string[] = [];
  let contractorName: string | null = null;

  for (const permitRecord of selectedPermitRecords) {
    permitProvenanceClasses.push(permitRecord.provenanceClass);
    if (permitRecord.permitNumber !== null && permitRecord.permitNumber !== undefined) {
      openPermitIds.push(permitRecord.permitNumber);
    }
    const recordContractor = permitRecord.contractor?.trim() ?? "";
    if (contractorName === null && recordContractor.length > 0) {
      contractorName = recordContractor;
    }
    const openYears = resolvePropertyPermitOpenYears({
      openedDate: permitRecord.openedDate ?? null,
      issuedDate: permitRecord.issuedDate ?? null,
      closedDate: permitRecord.closedDate ?? null,
      currentUtcYear: arguments_.currentUtcYear,
    });
    if (
      openYears !== null &&
      (maxOpenPermitYears === null || openYears > maxOpenPermitYears)
    ) {
      maxOpenPermitYears = openYears;
    }
  }

  return {
    maxOpenPermitYears,
    permitProvenanceClasses,
    openPermitIds,
    contractorName,
  };
}
