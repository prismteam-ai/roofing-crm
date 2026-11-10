import { TRPCError } from '@trpc/server';
import { agentAskSchema } from '@roofing/shared';
import { AgentLimitError } from '../agent/limits.js';
import { publicProcedure, router } from '../trpc.js';

export const agentRouter = router({
  ask: publicProcedure.input(agentAskSchema).mutation(async ({ ctx, input }) => {
    let release: (() => void) | undefined;
    try {
      release = ctx.agentAdmission.acquire();
      return await ctx.agent.ask(input);
    } catch (err) {
      if (err instanceof AgentLimitError) {
        ctx.setRetryAfter(err.retryAfterSeconds);
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: err.message, cause: err });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Agent failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      release?.();
    }
  }),
});
