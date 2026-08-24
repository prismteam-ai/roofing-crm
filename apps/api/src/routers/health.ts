/**
 * Health domain router.
 *
 * Exposes a no-auth reachability probe so evaluators can confirm the
 * Lambda is up without receiving credentials or environment secrets.
 */
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { publicProcedure, router } from "../trpc.js";
import { agentRouter, createAgentRouter } from "./agent.js";
import { countiesRouter } from "./counties.js";
import { leadsRouter } from "./leads.js";
import { propertiesRouter } from "./properties.js";
import { searchRouter } from "./search.js";

/**
 * Domain routers composed onto the public tRPC app.
 *
 * Local HTTP and Lambda share this factory so only the injected transports differ.
 */
export interface AppDomainRouters {
  counties: typeof countiesRouter;
  search: typeof searchRouter;
  properties: typeof propertiesRouter;
  leads: typeof leadsRouter;
  agent: ReturnType<typeof createAgentRouter>;
}

export const healthRouter = router({
  /**
   * Returns a fixed ok payload with no credentials or AWS key fields.
   * Emits a Powertools count metric for uptime dashboards.
   */
  ping: publicProcedure.query(({ ctx }) => {
    ctx.logger.debug("health.ping");
    ctx.metrics.addMetric("HealthPing", MetricUnit.Count, 1);
    return { ok: true as const };
  }),
});

/**
 * Builds the root app router over injectable domain routers.
 */
export function createAppRouter(domainRouters: AppDomainRouters) {
  return router({
    health: healthRouter,
    counties: domainRouters.counties,
    search: domainRouters.search,
    properties: domainRouters.properties,
    leads: domainRouters.leads,
    agent: domainRouters.agent,
  });
}

/** Root app router — health, catalog, search, property detail, leads, and agent stub. */
export const appRouter = createAppRouter({
  counties: countiesRouter,
  search: searchRouter,
  properties: propertiesRouter,
  leads: leadsRouter,
  agent: agentRouter,
});

export type AppRouter = typeof appRouter;
