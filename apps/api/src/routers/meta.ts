import { z } from 'zod';
import { gazetteerGeocoder, geocodeResultSchema } from '../agent/geocode.js';
import { publicProcedure, router } from '../trpc.js';

export const metaRouter = router({
  datasetInfo: publicProcedure.query(async ({ ctx }) => ({
    ...(await ctx.dataset.getDatasetInfo()),
    agentMode: ctx.agent.mode,
    build: ctx.build,
  })),
  /** Free-text place / ZIP -> lat/lon. Offline gazetteer first, then the configured geocoder. */
  geocode: publicProcedure
    .input(z.object({ query: z.string().trim().min(2).max(120) }))
    .output(geocodeResultSchema.nullable())
    .query(
      async ({ ctx, input }) =>
        (await gazetteerGeocoder(input.query)) ?? (await ctx.geocode(input.query)),
    ),
});
