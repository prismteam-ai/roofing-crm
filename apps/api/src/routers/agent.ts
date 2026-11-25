import { agentAskSchema } from '@roofing-crm/shared';
import { TRPCError } from '@trpc/server';
import { askAgent } from '../agent/agent.js';
import { publicProcedure, router } from '../trpc.js';

export const agentRouter = router({
  /** Natural-language question about roofing opportunities, answered from retrieved rows. */
  ask: publicProcedure.input(agentAskSchema).mutation(async ({ input, ctx }) => {
    // The endpoint is public and each answer costs model tokens, so calls are capped per day,
    // per browser workspace and for the whole deployment, before any model call is made.
    if (ctx.model) {
      const day = ctx.now().toISOString().slice(0, 10);
      const mine = await ctx.usage.increment(`agent#${ctx.workspaceId}`, day);
      const everyone = await ctx.usage.increment('agent#all', day);
      if (mine > ctx.agentLimits.perWorkspace || everyone > ctx.agentLimits.total) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message:
            'The assistant has reached its daily question limit for this demo. The map, filters and leads still work.',
        });
      }
    }
    return askAgent(
      { oracle: ctx.oracle, model: ctx.model, modelName: ctx.modelName, now: ctx.now },
      input,
    );
  }),
});
