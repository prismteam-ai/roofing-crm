import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';
import { OracleUnavailableError } from './data/mcpOraclePort.js';

const t = initTRPC.context<Context>().create();

/** Times every call, counts failures, and turns a data-service outage into one clear error. */
const observed = t.middleware(async ({ ctx, path, next }) => {
  const started = Date.now();
  const result = await next();
  const ms = Date.now() - started;
  ctx.metrics.addMetric('RequestDuration', MetricUnit.Milliseconds, ms);
  if (result.ok) {
    ctx.metrics.addMetric('RequestsProcessed', MetricUnit.Count, 1);
    ctx.logger.info('request ok', { path, ms });
    return result;
  }
  ctx.metrics.addMetric('RequestsFailed', MetricUnit.Count, 1);
  ctx.logger.error('request failed', { path, ms, error: result.error.message });
  if (result.error.cause instanceof OracleUnavailableError) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The property data service did not answer. Please try again in a moment.',
      cause: result.error.cause,
    });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(observed);
