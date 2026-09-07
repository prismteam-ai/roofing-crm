import type { LeadPriority } from "@/lib/db/schema";
import type { NewLead, NewLeadPermit } from "@/lib/db/schema";
import type { LeadSignal, PermitRecord, PropertyCandidate } from "@/lib/queries/types";

/**
 * Pure mappers from MCP candidates to CRM rows. Kept free of I/O for unit testing.
 *
 * @module leads/mappers
 */

/** Priority derived from the lead signal and roof age. */
export function priorityFor(signal: LeadSignal, roofAgeYears: number | null): LeadPriority {
  if (signal === "long_open_permit") return "high";
  if (signal === "open_permit") return (roofAgeYears ?? 0) >= 15 ? "high" : "medium";
  if (signal === "aged_roof") return (roofAgeYears ?? 0) >= 25 ? "high" : "medium";
  return "low";
}

/** Human-readable label for a lead signal. */
export function signalLabel(signal: LeadSignal): string {
  switch (signal) {
    case "long_open_permit":
      return "Long-open roofing permit";
    case "open_permit":
      return "Open roofing permit";
    case "aged_roof":
      return "Aged roof";
    default:
      return "No roofing signal";
  }
}

/** Build the `leads` insert row from a property candidate. */
export function toNewLead(p: PropertyCandidate): NewLead {
  return {
    parcelId: p.parcelId,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    status: "new",
    priority: priorityFor(p.signal, p.roofAgeYears),
    signal: p.signal,
    propertyType: p.propertyType,
    builtYear: p.builtYear,
    roofAgeYears: p.roofAgeYears,
    roofAgeBasis: p.roofAgeBasis,
    openRoofPermitCount: p.openRoofPermitCount,
    oldestOpenRoofPermitDays: p.oldestOpenRoofPermitDays,
    ownerName: p.ownerName,
    ownerMailState: p.ownerMailState,
    ownerOutOfState: p.ownerOutOfState,
    marketValue: p.marketValue,
    lastSaleDate: p.lastSaleDate,
    sourceUrls: p.sourceUrls,
  };
}

/** Build the permit snapshot rows attached to a lead. */
export function toLeadPermits(leadId: number, permits: readonly PermitRecord[]): NewLeadPermit[] {
  return permits.map((pr) => ({
    leadId,
    permitNumber: pr.permitNumber,
    status: pr.status,
    isOpen: pr.isOpen,
    daysOpen: pr.daysOpen,
    issueDate: pr.issueDate,
    closeDate: pr.closeDate,
    improvementType: pr.improvementType,
    contractorName: pr.contractorName,
    contractorQualifier: pr.contractorQualifier,
    contractorPhone: pr.contractorPhone,
    contractorLicense: pr.contractorLicense,
    bbbRating: pr.bbbRating,
    bbbAccredited: pr.bbbAccredited,
    bbbProfileUrl: pr.bbbProfileUrl,
    bbbMatchMethod: pr.bbbMatchMethod,
    sourceUrl: pr.sourceUrl,
  }));
}

/** Text summary written to the "created" activity. */
export function creationSummary(p: PropertyCandidate, permitCount: number): string {
  const parts = [signalLabel(p.signal)];
  if (p.roofAgeYears !== null)
    parts.push(`roof age ${p.roofAgeYears}y (${p.roofAgeBasis.replace("_", " ")})`);
  if (p.openRoofPermitCount > 0)
    parts.push(
      `${p.openRoofPermitCount} open roofing permit(s), oldest ${p.oldestOpenRoofPermitDays ?? "?"} days`,
    );
  parts.push(`${permitCount} permit(s) snapshotted`);
  return `Lead created from map search: ${parts.join("; ")}.`;
}

/** Format days as "X.Y years" for badges. */
export function formatDaysOpen(days: number | null): string {
  if (days === null) return "n/a";
  if (days < 365) return `${days} d`;
  return `${(days / 365).toFixed(1)} y`;
}
