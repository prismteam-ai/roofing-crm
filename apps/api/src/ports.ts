import {
  candidateSchema,
  datasetSummarySchema,
  jurisdictionCoverageSchema,
  propertyDetailSchema,
  type DatasetSummary,
  type Lead,
  type LeadUpdate,
  type PropertyDetail,
  type SearchInput,
} from '@roofing-crm/shared';
import { z } from 'zod';

/**
 * A lead row as the Oracle pipeline returns it. The CRM adds the score itself (Model step);
 * the pipeline only supplies facts.
 */
export const oracleLeadRowSchema = candidateSchema.omit({ score: true, scoreReasons: true });
export type OracleLeadRow = z.infer<typeof oracleLeadRowSchema>;

export const oracleSearchSchema = z.object({
  total: z.number().int(),
  agedRoofCount: z.number().int(),
  openPermitCount: z.number().int(),
  asOf: z.string(),
  coverageNote: z.string().nullish(),
  coverage: z.array(jurisdictionCoverageSchema).optional(),
  rows: z.array(oracleLeadRowSchema),
});
export type OracleSearch = z.infer<typeof oracleSearchSchema>;

export const oracleQuerySchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
  rowCount: z.number().int(),
  truncated: z.boolean(),
  sql: z.string(),
});
export type OracleQuery = z.infer<typeof oracleQuerySchema>;

export { datasetSummarySchema, propertyDetailSchema };

/**
 * The only way the CRM reaches property and permit data: the Oracle pipeline's published MCP
 * interface. The CRM does no ingestion and keeps no private copy of the dataset.
 */
export interface OraclePort {
  searchLeads(input: SearchInput): Promise<OracleSearch>;
  getProperty(apn: string): Promise<PropertyDetail | null>;
  datasetSummary(): Promise<DatasetSummary>;
  schema(): Promise<string>;
  /** One read-only SELECT, row-capped by the pipeline. Used by the agent only. */
  query(sql: string): Promise<OracleQuery>;
}

/** Counts paid agent calls so a public endpoint cannot run up the model bill. */
export interface UsageStore {
  /** Adds one to the counter and returns the new value. */
  increment(key: string, day: string): Promise<number>;
}

/** CRM-owned state. Leads are the one thing this product writes. */
export interface LeadStore {
  list(workspaceId: string): Promise<Lead[]>;
  get(workspaceId: string, leadId: string): Promise<Lead | null>;
  /** Atomic create: returns false, and writes nothing, when the lead id already exists. */
  putIfAbsent(workspaceId: string, lead: Lead): Promise<boolean>;
  update(workspaceId: string, patch: LeadUpdate, now: string): Promise<Lead | null>;
  remove(workspaceId: string, leadId: string): Promise<void>;
}
