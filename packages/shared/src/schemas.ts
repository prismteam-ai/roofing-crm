import { z } from 'zod';

/** County the CRM defaults to. One place to change it; nothing else hard-codes San Diego. */
export const DEFAULT_COUNTY = {
  name: 'San Diego County, CA',
  fips: '06073',
  center: { lat: 32.8242, lon: -117.1089 },
  zoom: 10,
  /** Bounding box used to reject pins outside the county before any query runs. */
  bbox: { minLat: 32.5, maxLat: 33.52, minLon: -117.62, maxLon: -116.07 },
} as const;

export const DEFAULT_ROOF_AGE_YEARS = 15;
export const DEFAULT_RADIUS_MILES = 1;
export const MAX_RADIUS_MILES = 25;
export const LONG_OPEN_YEARS = 2;

export const latSchema = z.number().min(-90).max(90);
export const lonSchema = z.number().min(-180).max(180);

export const pointSchema = z.object({ lat: latSchema, lon: lonSchema });
export type Point = z.infer<typeof pointSchema>;

export const signalSchema = z.enum(['any', 'aged_roof', 'open_permit', 'both']);
export type Signal = z.infer<typeof signalSchema>;

export const sortSchema = z.enum(['score', 'distance', 'roof_age', 'open_days']);
export type Sort = z.infer<typeof sortSchema>;

/** Radius search around a GPS fix or a dropped pin. Validated at the API boundary. */
export const searchInputSchema = z.object({
  center: pointSchema,
  radiusMiles: z.number().positive().max(MAX_RADIUS_MILES).default(DEFAULT_RADIUS_MILES),
  minRoofAgeYears: z.number().int().min(0).max(150).default(DEFAULT_ROOF_AGE_YEARS),
  minOpenYears: z.number().min(0).max(60).default(0),
  signal: signalSchema.default('any'),
  permitStatus: z.enum(['any', 'open', 'closed']).default('any'),
  sort: sortSchema.default('score'),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export const roofBasisSchema = z.enum(['last_roofing_permit', 'year_built', 'unknown']);
export type RoofBasis = z.infer<typeof roofBasisSchema>;

export const provenanceSchema = z.object({
  source: z.string(),
  sourceRecordId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  fetchedAt: z.string().nullable(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const candidateSchema = z.object({
  apn: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  zip: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  distanceMiles: z.number(),
  roofYear: z.number().int().nullable(),
  roofAgeYears: z.number().int().nullable(),
  roofBasis: roofBasisSchema,
  roofConfidence: z.string().nullable(),
  openRoofPermits: z.number().int(),
  longestOpenDays: z.number().int().nullable(),
  /** The longest-open roofing permit on the property, when there is one. */
  topOpenPermitId: z.string().nullish(),
  topOpenContractor: z.string().nullish(),
  topOpenLicenseNo: z.string().nullish(),
  ownerOccupied: z.boolean().nullable(),
  lastTransferDate: z.string().nullable(),
  useType: z.string().nullable(),
  score: z.number().int(),
  scoreReasons: z.array(z.string()),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const searchResultSchema = z.object({
  total: z.number().int(),
  agedRoofCount: z.number().int(),
  openPermitCount: z.number().int(),
  candidates: z.array(candidateSchema),
  asOf: z.string(),
  elapsedMs: z.number(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const contractorSchema = z.object({
  name: z.string().nullable(),
  licenseNumber: z.string().nullable(),
  licenseStatus: z.string().nullable(),
  classifications: z.string().nullable(),
  phone: z.string().nullable(),
  bbbRating: z.string().nullable(),
  bbbUrl: z.string().nullable(),
  /** Why a BBB score is absent, so the UI never shows a silent blank. */
  bbbNote: z.string().nullable(),
});
export type Contractor = z.infer<typeof contractorSchema>;

export const permitSchema = z.object({
  permitId: z.string(),
  apn: z.string().nullable(),
  permitType: z.string().nullable(),
  roofingClass: z.string().nullable(),
  isRoofing: z.boolean(),
  status: z.string().nullable(),
  isOpen: z.boolean(),
  appliedDate: z.string().nullable(),
  issuedDate: z.string().nullable(),
  closedDate: z.string().nullable(),
  daysOpen: z.number().int().nullable(),
  description: z.string().nullable(),
  contractor: contractorSchema.nullable(),
  provenance: provenanceSchema,
});
export type Permit = z.infer<typeof permitSchema>;

export const propertyDetailSchema = z.object({
  apn: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  zip: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  yearBuilt: z.number().int().nullable(),
  roofYear: z.number().int().nullable(),
  roofAgeYears: z.number().int().nullable(),
  roofBasis: roofBasisSchema,
  roofConfidence: z.string().nullable(),
  useType: z.string().nullable(),
  ownerOccupied: z.boolean().nullable(),
  ownerName: z.string().nullable(),
  ownerMailing: z.string().nullable(),
  lastTransferDate: z.string().nullable(),
  yearsSinceTransfer: z.number().int().nullable(),
  permits: z.array(permitSchema),
  provenance: provenanceSchema,
});
export type PropertyDetail = z.infer<typeof propertyDetailSchema>;

export const leadStatusSchema = z.enum([
  'new',
  'contacted',
  'qualified',
  'quoted',
  'won',
  'lost',
]);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadPrioritySchema = z.enum(['low', 'medium', 'high']);

export const leadSchema = z.object({
  leadId: z.string(),
  apn: z.string(),
  permitId: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  status: leadStatusSchema,
  priority: leadPrioritySchema,
  assignee: z.string().max(80).nullable(),
  notes: z.string().max(4000),
  /** Snapshot of why this became a lead, so the record still explains itself after data refreshes. */
  signal: z.object({
    roofAgeYears: z.number().int().nullable(),
    roofBasis: roofBasisSchema,
    openRoofPermits: z.number().int(),
    longestOpenDays: z.number().int().nullable(),
    score: z.number().int(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;

export const leadCreateSchema = leadSchema
  .omit({ leadId: true, createdAt: true, updatedAt: true, status: true })
  .extend({ status: leadStatusSchema.default('new') });
export type LeadCreate = z.input<typeof leadCreateSchema>;

export const leadUpdateSchema = z.object({
  leadId: z.string(),
  status: leadStatusSchema.optional(),
  priority: leadPrioritySchema.optional(),
  assignee: z.string().max(80).nullable().optional(),
  notes: z.string().max(4000).optional(),
});
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;

export const leadFilterSchema = z.object({
  status: leadStatusSchema.optional(),
  minRoofAgeYears: z.number().int().min(0).optional(),
  minOpenYears: z.number().min(0).optional(),
  hasOpenPermit: z.boolean().optional(),
  near: pointSchema.optional(),
  radiusMiles: z.number().positive().max(MAX_RADIUS_MILES).optional(),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;

export const agentAskSchema = z.object({
  question: z.string().min(3).max(600),
  /** Current map pin, so "near here" resolves without guessing. */
  center: pointSchema.optional(),
  radiusMiles: z.number().positive().max(MAX_RADIUS_MILES).optional(),
});
export type AgentAsk = z.infer<typeof agentAskSchema>;

export const agentEvidenceSchema = z.object({
  tool: z.string(),
  sql: z.string().nullable(),
  rowCount: z.number().int(),
  note: z.string().nullable(),
});

export const agentAnswerSchema = z.object({
  answer: z.string(),
  assumptions: z.array(z.string()),
  evidence: z.array(agentEvidenceSchema),
  rows: z.array(z.record(z.string(), z.unknown())),
  /** Map points for rows that carry coordinates, so answers can be plotted. */
  points: z.array(
    z.object({ apn: z.string(), lat: z.number(), lon: z.number(), label: z.string().nullable() }),
  ),
  model: z.string(),
  elapsedMs: z.number(),
});
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;

export const datasetSummarySchema = z.object({
  county: z.string(),
  asOf: z.string(),
  lastRunId: z.string().nullable(),
  counts: z.array(z.object({ table: z.string(), rows: z.number().int() })),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string().nullable(),
      rows: z.number().int().nullable(),
      fetchedAt: z.string().nullable(),
      limits: z.string().nullable(),
    }),
  ),
  manifestCid: z.string().nullable(),
});
export type DatasetSummary = z.infer<typeof datasetSummarySchema>;
