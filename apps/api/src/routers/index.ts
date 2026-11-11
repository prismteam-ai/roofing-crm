import { router } from '../trpc.js';
import { agentRouter } from './agent.js';
import { leadsRouter } from './leads.js';
import { metaRouter } from './meta.js';
import { propertyRouter } from './property.js';
import { searchRouter } from './search.js';

export const appRouter = router({
  search: searchRouter,
  property: propertyRouter,
  leads: leadsRouter,
  agent: agentRouter,
  meta: metaRouter,
});
export type AppRouter = typeof appRouter;
