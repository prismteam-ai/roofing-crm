/**
 * tRPC bootstrap for the roofing CRM API.
 *
 * Builds a typed procedure factory over ApiContext so routers share
 * Powertools logger, tracer, and metrics without importing the Lambda entrypoint.
 */
import type { Logger } from "@aws-lambda-powertools/logger";
import type { Metrics } from "@aws-lambda-powertools/metrics";
import type { Tracer } from "@aws-lambda-powertools/tracer";
import { initTRPC } from "@trpc/server";

/** Observability handles every public procedure receives via context. */
export interface ApiContext {
  logger: Logger;
  tracer: Tracer;
  metrics: Metrics;
}

const t = initTRPC.context<ApiContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
