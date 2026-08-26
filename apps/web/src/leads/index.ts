/**
 * LeadRecord SPA helpers: API client port, HTTP/memory adapters, list panel.
 *
 * Convert-to-lead UI calls leads.create; the Leads panel reloads via leads.list.
 */
export type {
  LeadRecordApiClient,
  LeadRecordCreateInput,
  LeadRecordListInput,
  LeadRecordManageableStatus,
} from "./lead-record-api-client";
export { createMemoryLeadRecordApiClient } from "./create-memory-lead-record-api-client";
export type { CreateMemoryLeadRecordApiClientOptions } from "./create-memory-lead-record-api-client";
export { createHttpLeadRecordApiClient } from "./create-http-lead-record-api-client";
export {
  LEAD_RECORD_LIST_EMPTY_COPY,
  LEADS_LIST_PERSISTENCE_LOCAL_API_COPY,
  LEADS_LIST_PERSISTENCE_LOCAL_MEMORY_COPY,
  LeadRecordListPanel,
  type LeadRecordListPanelProps,
} from "./LeadRecordListPanel";
