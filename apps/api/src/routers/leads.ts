import {
  haversineMiles,
  leadCreateSchema,
  leadFilterSchema,
  leadUpdateSchema,
  type Lead,
  type LeadFilter,
} from '@roofing-crm/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc.js';

export function filterLeads(leads: Lead[], filter: LeadFilter): Lead[] {
  return leads.filter((lead) => {
    if (filter.status && lead.status !== filter.status) return false;
    if (
      filter.minRoofAgeYears !== undefined &&
      (lead.signal.roofAgeYears === null || lead.signal.roofAgeYears < filter.minRoofAgeYears)
    ) {
      return false;
    }
    if (
      filter.hasOpenPermit !== undefined &&
      lead.signal.openRoofPermits > 0 !== filter.hasOpenPermit
    ) {
      return false;
    }
    if (
      filter.minOpenYears !== undefined &&
      (lead.signal.longestOpenDays ?? 0) < filter.minOpenYears * 365.25
    ) {
      return false;
    }
    if (filter.near && filter.radiusMiles !== undefined) {
      const miles = haversineMiles(filter.near, { lat: lead.lat, lon: lead.lon });
      if (miles > filter.radiusMiles) return false;
    }
    return true;
  });
}

export const leadsRouter = router({
  list: publicProcedure.input(leadFilterSchema.default({})).query(async ({ input, ctx }) => {
    const all = await ctx.leads.list(ctx.workspaceId);
    return { total: all.length, leads: filterLeads(all, input) };
  }),

  /** Converts a map match into a lead. One lead per property: a second click returns the first. */
  create: publicProcedure.input(leadCreateSchema).mutation(async ({ input, ctx }) => {
    const existing = (await ctx.leads.list(ctx.workspaceId)).find((l) => l.apn === input.apn);
    if (existing) return { lead: existing, created: false };
    const now = ctx.now().toISOString();
    const lead: Lead = { ...input, leadId: ctx.newId(), createdAt: now, updatedAt: now };
    await ctx.leads.put(ctx.workspaceId, lead);
    return { lead, created: true };
  }),

  update: publicProcedure.input(leadUpdateSchema).mutation(async ({ input, ctx }) => {
    const lead = await ctx.leads.update(ctx.workspaceId, input, ctx.now().toISOString());
    if (!lead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
    return lead;
  }),

  remove: publicProcedure
    .input(z.object({ leadId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.leads.remove(ctx.workspaceId, input.leadId);
      return { removed: input.leadId };
    }),
});
