import { leadsRouter } from "./routers/leads.ts";
import { mapRouter } from "./routers/map.ts";
import { metaRouter } from "./routers/meta.ts";
import { permitRouter, placeRouter, propertyRouter } from "./routers/details.ts";
import { createCallerFactory, router } from "./trpc.ts";

export const appRouter = router({
  meta: metaRouter,
  map: mapRouter,
  property: propertyRouter,
  permit: permitRouter,
  place: placeRouter,
  leads: leadsRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
