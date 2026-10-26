// B-07 T003 (data-model.md "Zod schemas"): lead shapes shared by apps/web and apps/api. The note
// text has no length cap here; the 4,000-char cap lives at the tRPC input boundary (T012).
import { z } from "zod";

export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"] as const;
export const LeadStatus = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const Lead = z.object({
  leadId: z.string().min(1),
  address: z.string(),
  lat: z.number(),
  lon: z.number(),
  status: LeadStatus,
  assignee: z.string().min(1),
  createdFrom: z.enum(["map", "list", "agent"]),
  sourceManifestCid: z.string().min(1),
  createdAt: z.string(),
  eventSequence: z.number().int().nonnegative(),
});
export type Lead = z.infer<typeof Lead>;

export const LeadSignals = z.object({
  roofAgeYears: z.number().optional(),
  roofAgeBasis: z.string().optional(),
  /** Absent on leads created before the confidence was recorded; never guessed. */
  roofAgeConfidence: z.enum(["high", "medium", "low", "none"]).optional(),
  openPermitId: z.string().optional(),
  openDays: z.number().optional(),
  /** Whether the saved permit was open or stalled when the lead was created (a stalled permit is
   *  not shown as "Open N days"). Absent on leads saved before this was recorded. */
  openPermitStatus: z.enum(["open", "stalled"]).optional(),
  contractor: z.string().optional(),
  /** Only shown as a rating when bbb_status = rated (constitution P0-4); otherwise a missing reason. */
  bbbRating: z.string().optional(),
  /** Task A's BBB state for the saved permit's contractor (no rating is published). Absent on older leads. */
  bbbStatus: z.enum(["rated", "not_found", "blocked", "not_checked"]).optional(),
  /** True when the snapshot read the permit's contractor fields, so no `contractor` then means the
   *  permit printed none. Absent on leads saved before this was recorded ("not saved with the lead"). */
  contractorRecorded: z.boolean().optional(),
  capturedAt: z.string(),
});
export type LeadSignals = z.infer<typeof LeadSignals>;

export const LeadEvent = z.object({
  sequence: z.number().int().nonnegative(),
  at: z.string(),
  by: z.string().min(1),
  change: z.string(),
  kind: z.enum(["create", "statusChange", "note", "assignee"]),
});
export type LeadEvent = z.infer<typeof LeadEvent>;

export const LeadFilters = z.object({
  roofAgeMinYears: z.number().nonnegative().optional(),
  permitStatus: z.enum(["open", "closed", "stalled"]).optional(),
  /** Only leads whose property has a permit open at least this many days in the CURRENT index
   *  (same SQL path as permitStatus; combined with it on the same permit when both are given). */
  permitOpenDaysMin: z.number().int().min(1).max(3650).optional(),
  radiusMi: z.number().positive().optional(),
  centerLat: z.number().min(-90).max(90).optional(),
  centerLon: z.number().min(-180).max(180).optional(),
});
export type LeadFilters = z.infer<typeof LeadFilters>;

/** What happened last on a lead, for the Leads table "Last activity" column. */
export const LeadLastActivity = z.object({
  /** ISO timestamp of the latest event. */
  at: z.string(),
  kind: z.enum(["created", "status", "note", "assignee", "other"]),
  /** Note text only: trimmed, whitespace collapsed, at most 120 characters. */
  excerpt: z.string().max(120).optional(),
});
export type LeadLastActivity = z.infer<typeof LeadLastActivity>;
