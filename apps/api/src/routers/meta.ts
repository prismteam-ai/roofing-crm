import { publicProcedure, router } from '../trpc.js';

export const metaRouter = router({
  /** What data the CRM is standing on: counts, sources, as-of time, published manifest. */
  dataset: publicProcedure.query(({ ctx }) => ctx.oracle.datasetSummary()),

  health: publicProcedure.query(({ ctx }) => ({
    ok: true,
    time: ctx.now().toISOString(),
    agentModel: ctx.model ? ctx.modelName : null,
  })),
});
