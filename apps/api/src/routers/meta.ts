import { publicProcedure, router } from '../trpc.js';

export const metaRouter = router({
  datasetInfo: publicProcedure.query(async ({ ctx }) => ({
    ...(await ctx.dataset.getDatasetInfo()),
    agentMode: ctx.agent.mode,
    build: ctx.build,
  })),
});
