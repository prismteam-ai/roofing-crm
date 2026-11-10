import { searchInputSchema } from '@roofing/shared';
import { publicProcedure, router } from '../trpc.js';

export const searchRouter = router({
  properties: publicProcedure.input(searchInputSchema).query(({ ctx, input }) =>
    ctx.dataset.findProperties({
      lat: input.lat,
      lon: input.lon,
      radiusMiles: input.radiusMiles,
      minRoofAge: input.minRoofAge,
      openRoofingPermitsOnly: input.openPermitsOnly,
      minOpenDays:
        input.minOpenYears === undefined ? undefined : Math.round(input.minOpenYears * 365.25),
      limit: input.limit,
    }),
  ),
});
