/**
 * HTTP LeadRecordApiClient over the hosted tRPC leads procedures.
 *
 * Uses tRPC HTTP JSON protocol so the SPA never persists leads in the browser.
 */
import type { LeadRecord } from "@roofing-crm-challenge/shared";

import { fetchTrpcMutation, fetchTrpcQuery } from "../api/trpc-http";
import type {
  LeadRecordApiClient,
  LeadRecordCreateInput,
  LeadRecordListInput,
} from "./lead-record-api-client";

/**
 * Builds a LeadRecordApiClient that calls leads.create / leads.list / leads.update / leads.archive over HTTP.
 */
export function createHttpLeadRecordApiClient(apiBaseUrl: string): LeadRecordApiClient {
  return {
    async createLeadRecord(input: LeadRecordCreateInput): Promise<LeadRecord> {
      return fetchTrpcMutation<LeadRecord>(apiBaseUrl, "leads.create", {
        propertyId: input.propertyId,
        county: input.county,
        ...(input.permitIds === undefined ? {} : { permitIds: input.permitIds }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      });
    },

    async listLeadRecords(input: LeadRecordListInput = {}): Promise<LeadRecord[]> {
      return fetchTrpcQuery<LeadRecord[]>(apiBaseUrl, "leads.list", input);
    },

    async updateLeadRecord(leadId, status) {
      return fetchTrpcMutation<LeadRecord>(apiBaseUrl, "leads.update", {
        leadId,
        status,
      });
    },

    async archiveLeadRecord(leadId: string): Promise<LeadRecord> {
      return fetchTrpcMutation<LeadRecord>(apiBaseUrl, "leads.archive", {
        leadId,
      });
    },
  };
}
