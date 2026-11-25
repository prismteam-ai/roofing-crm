import { agentAskSchema } from '@roofing-crm/shared';
import { askAgent } from '../agent/agent.js';
import { publicProcedure, router } from '../trpc.js';

export const agentRouter = router({
  /** Natural-language question about roofing opportunities, answered from retrieved rows. */
  ask: publicProcedure.input(agentAskSchema).mutation(({ input, ctx }) =>
    askAgent({ oracle: ctx.oracle, model: ctx.model, modelName: ctx.modelName, now: ctx.now }, input),
  ),
});
