/**
 * Consumer contract v1.1 — published by the Oracle Property Intelligence pipeline
 * (oracle-property-intelligence-platform-pipeline-brevard-fl).
 *
 * The pipeline owns these names and all derived signals. The CRM matches them
 * verbatim and never recomputes a derived field, so the two surfaces cannot
 * disagree on screen about the same parcel.
 */
import { z } from 'zod';

/** Provenance block carried on every row (elephant-query-db convention). */
export const provenance = z.object({
  source_system: z.string(),
  source_record_key: z.string(),
  source_record_hash: z.string().nullish(),
  source_artifact_uri: z.string().nullish(),
  loaded_at: z.string(),
  run_id: z.string(),
});

/**
 * How `roof_age_years` was established. Drives the CRM's evidence tiers:
 * only PERMIT is a real roof age — the year-built values are building age,
 * which at Brevard's housing distribution matches ~96% of parcels at a
 * 15-year threshold and therefore cannot be used as a filter on its own.
 */
export const roofAgeBasis = z.enum(['PERMIT', 'ACT_YR_BLT', 'EFF_YR_BLT', 'UNKNOWN']);
export type RoofAgeBasis = z.infer<typeof roofAgeBasis>;

/**
 * FDOR's statewide layer carries current-roll sales only: SALE_YR1 is 0 for
 * ~89% of parcels and non-zero values span just 2024-2025. Absence of a sale
 * is therefore *unknown tenure*, never long tenure.
 */
export const ownerTenureBasis = z.enum(['FDOR_ROLL_SALE', 'BCPAO_SALE_HISTORY', 'UNKNOWN_NO_SALE_IN_ROLL']);
export type OwnerTenureBasis = z.infer<typeof ownerTenureBasis>;

/** Raw status is preserved verbatim; this is the normalised vocabulary. */
export const permitStatus = z.enum([
  'OPEN', 'IN_REVIEW', 'ISSUED', 'INSPECTIONS',
  'CLOSED', 'EXPIRED', 'WITHDRAWN', 'VOID', 'UNKNOWN',
]);
export type PermitStatus = z.infer<typeof permitStatus>;

/** Statuses the pipeline treats as closed. UNKNOWN counts as open, and the CRM flags it. */
export const CLOSED_STATUSES: readonly PermitStatus[] = ['CLOSED', 'EXPIRED', 'WITHDRAWN', 'VOID'];

export const tableRef = z.object({
  path: z.string(),
  files: z.array(z.string()),
  row_count: z.number().int().nonnegative(),
  cid: z.string().nullish(),
  schema_version: z.string(),
  partitioned_by: z.string().nullish(),
});
export type TableRef = z.infer<typeof tableRef>;

/**
 * Per-run counts, so the CRM's coverage panel reports real numbers without
 * scanning 347k rows in the browser.
 */
export const coverage = z.object({
  roof_age_basis: z.record(z.number()).default({}),
  owner_tenure_basis: z.record(z.number()).default({}),
  /** Decade-floored year -> count, e.g. {"1960": 19699}. */
  act_yr_blt_decade: z.record(z.number()).default({}),
  geocode_source: z.record(z.number()).default({}),
  unlocatable_permits: z.number().int().nonnegative().nullish(),
});
export type Coverage = z.infer<typeof coverage>;

/** `latest.json` — the only mutable file; `v/<dataset_version>/` is immutable. */
export const latestManifest = z.object({
  dataset_version: z.string(),
  run_id: z.string(),
  county: z.string(),
  county_fips: z.string(),
  fdor_co_no: z.number().int(),
  generated_at: z.string(),
  base_url: z.string(),
  ipfs: z.object({ root_cid: z.string().nullish(), ipns: z.string().nullish() }).default({}),
  tables: z.record(tableRef),
  coverage: coverage.optional(),
});
export type LatestManifest = z.infer<typeof latestManifest>;
