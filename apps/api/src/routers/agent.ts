import { TRPCError } from '@trpc/server';
import { agentAskSchema } from '@roofing/shared';
import { publicProcedure, router } from '../trpc.js';

export const agentRouter = router({
  ask: publicProcedure.input(agentAskSchema).mutation(async ({ ctx, input }) => {
    try {
      return await ctx.agent.ask(input);
    } catch (err) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Agent failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }),
});
