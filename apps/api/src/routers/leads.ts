import { LeadFilter, LeadStatus } from "@crm/leads-db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { leadInputFor } from "../snapshot.ts";
import { procedure, router } from "../trpc.ts";

const Target = z.object({
  propertyId: z.string().min(1).max(64),
  permitId: z.string().min(1).max(128).optional(),
});

export const leadsRouter = router({
  create: procedure.input(Target).mutation(async ({ ctx, input }) => {
    const i = await leadInputFor(ctx.deps.oracle, input.propertyId, input.permitId);
    return ctx.deps.leads(ctx.workspace).createFromCandidate(i);
  }),

  createMany: procedure
    .input(z.object({ items: z.array(Target).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const items = [];
      for (const t of input.items) items.push(await leadInputFor(ctx.deps.oracle, t.propertyId, t.permitId));
      const r = await ctx.deps.leads(ctx.workspace).createMany(items);
      return { created: r.created, existing: r.existing, leads: r.leads };
    }),

  list: procedure
    .input(LeadFilter.optional())
    .query(({ ctx, input }) => ctx.deps.leads(ctx.workspace).list(input)),

  get: procedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const l = await ctx.deps.leads(ctx.workspace).get(input.id);
    if (!l) throw new TRPCError({ code: "NOT_FOUND", message: `no lead ${input.id}` });
    return l;
  }),

  updateStatus: procedure
    .input(z.object({ id: z.string().min(1), status: LeadStatus }))
    .mutation(({ ctx, input }) => ctx.deps.leads(ctx.workspace).updateStatus(input.id, input.status)),

  addNote: procedure
    .input(z.object({ id: z.string().min(1), body: z.string().min(1).max(4000) }))
    .mutation(({ ctx, input }) => ctx.deps.leads(ctx.workspace).addNote(input.id, input.body)),

  /** Flags leads stale against the pinned run (also run on a schedule after a manifest upgrade). */
  reconcile: procedure.mutation(({ ctx }) => {
    const { oracle } = ctx.deps;
    return ctx.deps.leads(ctx.workspace).reconcileWithSnapshot({
      cid: oracle.manifestCid,
      hasProperty: (id) => oracle.hasProperty(id),
      signalsFor: (id) => oracle.signalsFor(id),
    });
  }),
});
