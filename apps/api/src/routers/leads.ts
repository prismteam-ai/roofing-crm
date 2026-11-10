import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { leadCreateSchema, leadFilterSchema, leadUpdateSchema } from '@roofing/shared';
import { router, workspaceProcedure } from '../trpc.js';

export const leadsRouter = router({
  list: workspaceProcedure
    .input(leadFilterSchema.default({}))
    .query(({ ctx, input }) => ctx.leads.list(ctx.workspaceId, input)),
  create: workspaceProcedure
    .input(leadCreateSchema)
    .mutation(({ ctx, input }) => ctx.leads.create(ctx.workspaceId, input)),
  update: workspaceProcedure.input(leadUpdateSchema).mutation(({ ctx, input }) => {
    const lead = ctx.leads.update(ctx.workspaceId, input.id, {
      status: input.status,
      notes: input.notes,
    });
    if (!lead) throw new TRPCError({ code: 'NOT_FOUND' });
    return lead;
  }),
  delete: workspaceProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.leads.delete(ctx.workspaceId, input.id)) throw new TRPCError({ code: 'NOT_FOUND' });
    return { ok: true };
  }),
});
