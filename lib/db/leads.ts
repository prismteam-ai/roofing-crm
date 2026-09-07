import "server-only";
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, supportsTransactions, type Db } from "./client";
import {
  LEAD_STATUSES,
  leadActivities,
  leadPermits,
  leads,
  type Lead,
  type LeadActivity,
  type LeadPermit,
  type LeadStatus,
  type NewLead,
  type NewLeadPermit,
} from "./schema";
import { haversineSql } from "@/lib/queries/geo";

/**
 * Lead repository (Drizzle). All CRM reads/writes go through here.
 *
 * @module db/leads
 */

/** Filters accepted by the leads list. */
export const leadFilterSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  roofAgeMin: z.coerce.number().int().min(0).max(150).optional(),
  permitStatus: z.enum(["any", "open", "long_open", "none"]).default("any"),
  /** Minimum days the oldest open permit has been open (used with permitStatus=open/long_open). */
  openDaysMin: z.coerce.number().int().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMiles: z.coerce.number().min(0.1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

/** Lead row plus its permit snapshot count, as listed. */
export interface LeadListItem extends Lead {
  permitCount: number;
  distanceMiles: number | null;
}

/** Full lead with permits and activities. */
export interface LeadDetail extends Lead {
  permits: LeadPermit[];
  activities: LeadActivity[];
}

/** Payload for creating a lead (candidate + permit snapshot). */
export interface CreateLeadInput {
  lead: NewLead;
  permits: Omit<NewLeadPermit, "leadId">[];
  summary: string;
}

/** Result of a bulk create. */
export interface CreateLeadsResult {
  created: Lead[];
  existing: Lead[];
}

/** Insert the permit snapshot and the "created" activity for a freshly inserted lead. */
async function insertLeadChildren(exec: Db, leadId: number, input: CreateLeadInput): Promise<void> {
  if (input.permits.length > 0) {
    await exec.insert(leadPermits).values(input.permits.map((p) => ({ ...p, leadId })));
  }
  await exec.insert(leadActivities).values({ leadId, type: "created", body: input.summary });
}

/**
 * Create leads, skipping parcels that already have one (unique on `parcel_id`).
 *
 * Atomicity: on drivers with transaction support (node-postgres, Neon WebSocket) each lead
 * and its children are written in one transaction. The Neon HTTP driver has no
 * transactions (each statement is its own request), so there the multi-step path is made
 * idempotent instead: the lead row is inserted with ON CONFLICT DO NOTHING, and children are
 * keyed by `lead_id`; if a previous attempt inserted the lead but crashed before writing its
 * children (no "created" activity yet), a retry re-creates the snapshot and activity for that
 * lead instead of reporting it as "existing".
 */
export async function createLeads(
  inputs: CreateLeadInput[],
  db: Db = getDb(),
): Promise<CreateLeadsResult> {
  const created: Lead[] = [];
  const existing: Lead[] = [];
  for (const input of inputs) {
    const outcome = supportsTransactions()
      ? await db.transaction((tx) => createOneLead(tx as unknown as Db, input))
      : await createOneLead(db, input);
    if (outcome.status === "created") created.push(outcome.lead);
    else existing.push(outcome.lead);
  }
  return { created, existing };
}

async function createOneLead(
  exec: Db,
  input: CreateLeadInput,
): Promise<{ status: "created" | "existing"; lead: Lead }> {
  const inserted = await exec
    .insert(leads)
    .values(input.lead)
    .onConflictDoNothing({ target: leads.parcelId })
    .returning();
  const lead = inserted[0];
  if (lead) {
    await insertLeadChildren(exec, lead.id, input);
    return { status: "created", lead };
  }
  const [found] = await exec
    .select()
    .from(leads)
    .where(eq(leads.parcelId, input.lead.parcelId))
    .limit(1);
  if (!found) throw new Error(`Lead for parcel ${input.lead.parcelId} vanished during insert`);
  // Repair a half-written lead from an earlier non-transactional attempt.
  const [createdActivity] = await exec
    .select({ id: leadActivities.id })
    .from(leadActivities)
    .where(and(eq(leadActivities.leadId, found.id), eq(leadActivities.type, "created")))
    .limit(1);
  if (!createdActivity) {
    await exec.delete(leadPermits).where(eq(leadPermits.leadId, found.id));
    await insertLeadChildren(exec, found.id, input);
    return { status: "created", lead: found };
  }
  return { status: "existing", lead: found };
}

/** List leads with filters, newest first (or nearest first when a radius is given). */
export async function listLeads(filters: LeadFilters, db: Db = getDb()): Promise<LeadListItem[]> {
  const where: SQL[] = [];
  if (filters.status) where.push(eq(leads.status, filters.status));
  if (filters.roofAgeMin !== undefined) where.push(gte(leads.roofAgeYears, filters.roofAgeMin));
  if (filters.permitStatus === "open") where.push(sql`${leads.openRoofPermitCount} > 0`);
  if (filters.permitStatus === "long_open") {
    where.push(sql`${leads.openRoofPermitCount} > 0`);
    where.push(gte(leads.oldestOpenRoofPermitDays, filters.openDaysMin ?? 5 * 365));
  }
  if (filters.permitStatus === "none") where.push(eq(leads.openRoofPermitCount, 0));
  if (filters.permitStatus === "open" && filters.openDaysMin !== undefined) {
    where.push(gte(leads.oldestOpenRoofPermitDays, filters.openDaysMin));
  }
  const hasRadius =
    filters.lat !== undefined && filters.lng !== undefined && filters.radiusMiles !== undefined;
  const distanceExpr = hasRadius
    ? sql<number>`${sql.raw(haversineSql({ lat: filters.lat!, lng: filters.lng! }, "lat", "lng"))}`
    : sql<number | null>`NULL`;
  if (hasRadius) where.push(sql`${distanceExpr} <= ${filters.radiusMiles}`);

  const permitCountExpr = sql<number>`(SELECT count(*) FROM ${leadPermits} WHERE ${leadPermits.leadId} = ${leads.id})`;
  const rows = await db
    .select({ lead: leads, permitCount: permitCountExpr, distanceMiles: distanceExpr })
    .from(leads)
    .where(where.length ? and(...where) : undefined)
    .orderBy(hasRadius ? distanceExpr : desc(leads.createdAt))
    .limit(filters.limit);
  return rows.map((r) => ({
    ...r.lead,
    permitCount: Number(r.permitCount),
    distanceMiles: r.distanceMiles === null ? null : Number(r.distanceMiles),
  }));
}

/** Fetch one lead with its permit snapshot and activity timeline. */
export async function getLead(id: number, db: Db = getDb()): Promise<LeadDetail | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return null;
  const [permits, activities] = await Promise.all([
    db
      .select()
      .from(leadPermits)
      .where(eq(leadPermits.leadId, id))
      .orderBy(desc(leadPermits.isOpen), desc(leadPermits.daysOpen)),
    db
      .select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, id))
      .orderBy(desc(leadActivities.createdAt)),
  ]);
  return { ...lead, permits, activities };
}

/** Change a lead's status and record the transition. */
export async function updateLeadStatus(
  id: number,
  status: LeadStatus,
  db: Db = getDb(),
): Promise<Lead | null> {
  const [before] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!before) return null;
  if (before.status === status) return before;
  const [after] = await db
    .update(leads)
    .set({ status, updatedAt: new Date() })
    .where(eq(leads.id, id))
    .returning();
  await db.insert(leadActivities).values({
    leadId: id,
    type: "status_change",
    body: `Status changed from ${before.status} to ${status}`,
  });
  return after ?? null;
}

/** Append a note to a lead. */
export async function addLeadNote(
  id: number,
  body: string,
  db: Db = getDb(),
): Promise<LeadActivity | null> {
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, id)).limit(1);
  if (!lead) return null;
  const [activity] = await db
    .insert(leadActivities)
    .values({ leadId: id, type: "note", body })
    .returning();
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, id));
  return activity ?? null;
}

/** Delete a lead (permits and activities cascade). */
export async function deleteLead(id: number, db: Db = getDb()): Promise<boolean> {
  const deleted = await db.delete(leads).where(eq(leads.id, id)).returning({ id: leads.id });
  return deleted.length > 0;
}

/** Parcel ids that already have a lead (used to badge map results). */
export async function existingLeadParcelIds(
  parcelIds: readonly string[],
  db: Db = getDb(),
): Promise<Map<string, number>> {
  if (parcelIds.length === 0) return new Map();
  const rows = await db
    .select({ id: leads.id, parcelId: leads.parcelId })
    .from(leads)
    .where(inArray(leads.parcelId, [...parcelIds]));
  return new Map(rows.map((r) => [r.parcelId, r.id]));
}

/** Count leads per status for the dashboard header. */
export async function leadStatusCounts(db: Db = getDb()): Promise<Record<LeadStatus, number>> {
  const rows = await db
    .select({ status: leads.status, n: sql<number>`count(*)` })
    .from(leads)
    .groupBy(leads.status);
  const out = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
