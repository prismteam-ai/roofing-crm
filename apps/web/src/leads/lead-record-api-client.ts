/**
 * SPA port for LeadRecord create / list against the tRPC leads router.
 *
 * Browser code never writes Elephant facts; it only snapshots outreach via
 * leads.create and reloads from leads.list. No localStorage fallback.
 */
import type { LeadRecord, LeadStatus } from "@roofing-crm-challenge/shared";

/**
 * Outreach statuses the list panel may set via leads.update (not archived).
 */
export type LeadRecordManageableStatus = Exclude<LeadStatus, "archived">;

/**
 * Input for converting a published property into a LeadRecord.
 */
export interface LeadRecordCreateInput {
  propertyId: string;
  county: string;
  permitIds?: string[];
  notes?: string;
  /**
   * Street shown on the lead row. Local memory clients persist this; HTTP
   * clients omit it because leads.create snapshots address from the API.
   */
  addressSnapshot?: string;
}

/**
 * Filter for listing LeadRecords from the API.
 */
export interface LeadRecordListInput {
  status?: LeadRecord["status"];
  county?: string;
}

/**
 * Client surface the map shell uses for persistent leads.
 *
 * Implementations call the hosted API (or an in-memory stand-in in tests).
 */
export interface LeadRecordApiClient {
  createLeadRecord(input: LeadRecordCreateInput): Promise<LeadRecord>;
  listLeadRecords(input?: LeadRecordListInput): Promise<LeadRecord[]>;
  updateLeadRecord(
    leadId: string,
    status: LeadRecordManageableStatus,
  ): Promise<LeadRecord>;
  archiveLeadRecord(leadId: string): Promise<LeadRecord>;
}
