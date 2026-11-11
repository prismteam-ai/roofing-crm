import { z } from 'zod';

export const contractorSchema = z.object({
  contractor_id: z.string(),
  name: z.string(),
  license_number: z.string().nullable(),
  license_type: z.string().nullable(),
  license_status: z.string().nullable(),
  ever_disciplined: z.boolean().nullable(),
  bbb_rating: z.string().nullable(),
  bbb_url: z.string().nullable(),
  /** `stale` = rating read from an archived copy of the BBB profile. */
  bbb_state: z.enum(['confirmed_present', 'confirmed_empty', 'unavailable', 'unknown', 'stale']),
  source_url: z.string().nullable(),
  ingested_at: z.string(),
});
export type Contractor = z.infer<typeof contractorSchema>;

export const permitSchema = z.object({
  permit_id: z.string(),
  source_system: z.string(),
  pin14: z.string().nullable(),
  address: z.string().nullable(),
  permit_type: z.string().nullable(),
  work_description: z.string().nullable(),
  is_roofing: z.boolean(),
  roofing_match_rule: z.string().nullable(),
  status: z.string().nullable(),
  status_is_open: z.boolean(),
  issued_at: z.string().nullable(),
  applied_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  open_days: z.number().int().nullable(),
  contractor_name: z.string().nullable(),
  contractor_id: z.string().nullable(),
  contractor: contractorSchema.nullable().optional(),
  source_url: z.string().nullable(),
  ingested_at: z.string(),
});
export type Permit = z.infer<typeof permitSchema>;

// Pipeline rows carry extra columns (pin10, geohash6, distance_miles, run_id, ...); z.object strips
// them, so additive pipeline changes never break parsing. lat/lon stay required: findProperties only
// returns rows inside a radius, which needs coordinates.
export const propertySchema = z.object({
  pin14: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  zip: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  year_built: z.number().int().nullable(),
  class: z.string().nullable(),
  municipality: z.string().nullable(),
  township: z.string().nullable(),
  owner_name: z.string().nullable(),
  mail_address: z.string().nullable(),
  mail_city: z.string().nullable(),
  mail_state: z.string().nullable(),
  mail_zip: z.string().nullable(),
  is_out_of_area: z.boolean().nullable(),
  last_sale_date: z.string().nullable(),
  last_sale_price: z.number().nullable(),
  roof_age_years: z.number().nullable(),
  roof_age_basis: z.enum(['reroof_permit', 'new_construction_permit', 'year_built']).nullable(),
  roof_age_confidence: z.enum(['high', 'medium', 'low']).nullable(),
  roof_age_anchor_date: z.string().nullable().optional(),
  source_url: z.string().nullable(),
  ingested_at: z.string(),
  permits: z.array(permitSchema),
});
export type Property = z.infer<typeof propertySchema>;

export const datasetSourceSchema = z.object({
  runId: z.string(),
  /** Run the pipeline published as current when it differs from the run served. */
  publishedRunId: z.string().optional(),
  rootCid: z.string().nullable(),
  syncedAt: z.string().nullable(),
});
export type DatasetSource = z.infer<typeof datasetSourceSchema>;

export const searchInputSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusMiles: z.number().min(0.1).max(50).default(2),
  minRoofAge: z.number().min(0).max(200).optional(),
  openPermitsOnly: z.boolean().default(false),
  minConfidence: z.enum(['low', 'medium', 'high']).optional(),
  minOpenYears: z.number().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export const searchResultSchema = z.object({
  properties: z.array(propertySchema),
  /** Matches in the radius before `limit` was applied (pipeline MCP; fixture client mirrors it). */
  total_in_radius: z.number().int().optional(),
  source: datasetSourceSchema,
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const datasetInfoSchema = z.object({
  runId: z.string(),
  publishedRunId: z.string().optional(),
  rootCid: z.string().nullable(),
  counts: z.record(z.string(), z.number()),
  limitations: z.array(z.string()),
  client: z.enum(['mcp', 'fixture']).optional(),
});
export type DatasetInfo = z.infer<typeof datasetInfoSchema>;

export const leadStatusSchema = z.enum(['new', 'contacted', 'qualified', 'lost']);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  pin14: z.string(),
  address: z.string(),
  lat: z.number(),
  lon: z.number(),
  roofAgeYears: z.number().nullable(),
  permitId: z.string().nullable(),
  permitStatus: z.string().nullable(),
  permitIsOpen: z.boolean(),
  openDays: z.number().int().nullable(),
  status: leadStatusSchema,
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadCreateSchema = leadSchema
  .pick({ pin14: true, address: true, lat: true, lon: true })
  .extend({
    roofAgeYears: z.number().nullable().default(null),
    permitId: z.string().nullable().default(null),
    permitStatus: z.string().nullable().default(null),
    permitIsOpen: z.boolean().default(false),
    openDays: z.number().int().nullable().default(null),
    notes: z.string().max(4000).default(''),
  });
export type LeadCreate = z.infer<typeof leadCreateSchema>;

export const leadUpdateSchema = z.object({
  id: z.string(),
  status: leadStatusSchema.optional(),
  notes: z.string().max(4000).optional(),
});

export const leadFilterSchema = z.object({
  minRoofAge: z.number().min(0).optional(),
  status: leadStatusSchema.optional(),
  openPermitsOnly: z.boolean().optional(),
  minOpenYears: z.number().min(0).optional(),
  center: z
    .object({ lat: z.number(), lon: z.number(), radiusMiles: z.number().min(0.1) })
    .optional(),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;

export const agentAskSchema = z.object({
  question: z.string().min(1).max(2000),
  context: z
    .object({ lat: z.number(), lon: z.number(), radiusMiles: z.number().optional() })
    .optional(),
});
export type AgentAsk = z.infer<typeof agentAskSchema>;

export const agentCitationSchema = z.object({
  pin14: z.string().nullable(),
  permitId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
});
export const agentAnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(agentCitationSchema),
  assumptions: z.array(z.string()),
  missingData: z.array(z.string()),
  traceId: z.string(),
  mode: z.enum(['llm', 'offline']),
});
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;
