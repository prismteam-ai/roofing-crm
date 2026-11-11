import { z } from 'zod';
import { publicProcedure, router } from '../trpc.js';

export const propertyRouter = router({
  get: publicProcedure
    .input(z.object({ pin14: z.string().length(14) }))
    .query(({ ctx, input }) => ctx.dataset.getProperty(input.pin14)),
});
