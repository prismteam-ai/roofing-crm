import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc.js';

export const apnSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);

export const propertyRouter = router({
  /** One property with all its permits, contractor and BBB fields, and source provenance. */
  detail: publicProcedure.input(z.object({ apn: apnSchema })).query(async ({ input, ctx }) => {
    const property = await ctx.oracle.getProperty(input.apn);
    if (!property) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `No property with APN ${input.apn}` });
    }
    return property;
  }),
});
