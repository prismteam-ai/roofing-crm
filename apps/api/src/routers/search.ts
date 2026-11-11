import { haversineMiles, rankProperties, searchInputSchema, type Property } from '@roofing/shared';
import { publicProcedure, router } from '../trpc.js';

/** Toggle off: oldest roof first (ties by distance). Toggle on: longest-open permit, then roof age. */
export function rankForLeads(
  properties: Property[],
  center: { lat: number; lon: number },
  openPermitsOnly: boolean,
): Property[] {
  if (openPermitsOnly) return rankProperties(properties);
  const dist = (p: Property) => haversineMiles(center.lat, center.lon, p.lat, p.lon);
  return [...properties].sort(
    (a, b) => (b.roof_age_years ?? -1) - (a.roof_age_years ?? -1) || dist(a) - dist(b),
  );
}

export const searchRouter = router({
  properties: publicProcedure.input(searchInputSchema).query(async ({ ctx, input }) => {
    const res = await ctx.dataset.findProperties({
      lat: input.lat,
      lon: input.lon,
      radiusMiles: input.radiusMiles,
      minRoofAge: input.minRoofAge,
      openRoofingPermitsOnly: input.openPermitsOnly,
      minOpenDays:
        input.minOpenYears === undefined ? undefined : Math.round(input.minOpenYears * 365.25),
      sort: input.openPermitsOnly ? 'open_days' : 'roof_age',
      minConfidence: input.minConfidence,
      limit: input.limit,
    });
    return res;
  }),
});
