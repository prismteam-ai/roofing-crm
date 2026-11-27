import { LeadSignals, PermitStatus } from "@crm/shared";
import { z } from "zod";

export const LeadStatus = z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]);
export type LeadStatus = z.infer<typeof LeadStatus>;

const NEXT: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["qualified", "lost"],
  qualified: ["proposal", "lost"],
  proposal: ["won", "lost"],
  won: [],
  lost: ["new"],
};
export const TERMINAL: LeadStatus[] = ["won", "lost"];

export function allowedTransitions(from: LeadStatus): LeadStatus[] {
  return NEXT[from];
}

/** What a lead keeps from the run it was created from: the signals reconcile compares, and where it is. */
export const LeadSnapshot = LeadSignals.extend({
  permitStatuses: z.array(PermitStatus),
  lat: z.number(),
  lon: z.number(),
  address: z.string().nullable(),
  city: z.string().nullable(),
});
export type LeadSnapshot = z.infer<typeof LeadSnapshot>;

export const LeadInput = z.object({
  propertyId: z.string().min(1),
  permitId: z.string().min(1).optional(),
  manifestCid: z.string().min(1),
  signals: LeadSnapshot,
});
export type LeadInput = z.infer<typeof LeadInput>;

export const Lead = z.object({
  id: z.string(),
  propertyId: z.string(),
  permitId: z.string().nullable(),
  status: LeadStatus,
  priority: z.enum(["high", "medium", "low"]),
  assignee: z.string().nullable(),
  sourceManifestCid: z.string(),
  signals: LeadSnapshot,
  stale: z.boolean(),
  staleReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lead = z.infer<typeof Lead>;

export interface LeadNote {
  at: string;
  body: string;
}
export interface LeadEvent {
  at: string;
  type: "created" | "status" | "stale" | "note";
  from?: string;
  to?: string;
  detail?: string;
}
export interface LeadWithHistory extends Lead {
  notes: LeadNote[];
  events: LeadEvent[];
}

export const LeadFilter = z.object({
  status: z.array(LeadStatus).optional(),
  stale: z.boolean().optional(),
  search: z.string().optional(),
  minRoofAgeYears: z.number().min(0).optional(),
  minOpenYears: z.number().min(0).optional(),
  permitStatus: z.array(PermitStatus).optional(),
  near: z
    .object({ center: z.object({ lat: z.number(), lon: z.number() }), radiusMiles: z.number().positive() })
    .optional(),
});
export type LeadFilter = z.infer<typeof LeadFilter>;

/** Priority from the signals: long-open permits and old roofs first. */
export function priorityOf(s: LeadSnapshot): Lead["priority"] {
  const openYears = (s.maxOpenDays ?? 0) / 365.25;
  if (openYears >= 5 || (s.roofAgeYears ?? 0) >= 25) return "high";
  if (openYears >= 1 || (s.roofAgeYears ?? 0) >= 15) return "medium";
  return "low";
}
