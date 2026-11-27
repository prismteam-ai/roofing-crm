import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { initTRPC, TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { PUBLIC_WORKSPACE, type Context } from './context.js';
import { OracleUnavailableError } from './data/mcpOraclePort.js';

// Stack traces stay in the logs; a public caller gets the message and code only.
const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape }) => ({ ...shape, data: { ...shape.data, stack: undefined } }),
});

/** True for 4xx errors: the request was refused, the service did not fail. */
export function isCallerMistake(error: TRPCError): boolean {
  return getHTTPStatusCodeFromError(error) < 500;
}

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
  // A refused request (bad input, unknown record, missing header) is the caller's mistake, not
  // an outage. Counted apart, so the failure alarm only fires when the service itself breaks.
  if (isCallerMistake(result.error)) {
    ctx.metrics.addMetric('RequestsRejected', MetricUnit.Count, 1);
    ctx.logger.warn('request rejected', { path, ms, error: result.error.message });
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

/**
 * For anything that reads or writes per-browser state (leads, agent quota). A call without a
 * valid `x-workspace-id` header is refused, so nobody lands in a shared lead book by accident.
 */
export const workspaceProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.workspaceId === PUBLIC_WORKSPACE) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Missing or malformed x-workspace-id header (8 to 64 letters, digits, "-" or "_").',
    });
  }
  return next();
});
