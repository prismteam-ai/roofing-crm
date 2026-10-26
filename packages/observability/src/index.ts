// Shared Powertools middleware (constitution Article VIII): every new Lambda handler in this
// story (apps/sync, apps/api's LeadIndex port) wraps with `withObservability` so JSON logging,
// X-Ray tracing and named custom metrics are never hand-rolled per handler. Metric names are
// constants (./metricNames.ts), never inline string literals at a call site (tasks.md T011).
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { METRICS_NAMESPACE } from "./metricNames.js";

export { downloadS3ObjectToFile } from "./s3.js";

export {
  AGENT_CITING_OUTCOMES,
  AGENT_METRIC_DIMENSIONS,
  API_SERVICE_NAME,
  METRIC_NAMES,
  METRICS_NAMESPACE,
  type MetricName,
} from "./metricNames.js";
export interface Observability {
  readonly logger: Logger;
  readonly tracer: Tracer;
  readonly metrics: Metrics;
}

export function createObservability(serviceName: string): Observability {
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ namespace: METRICS_NAMESPACE, serviceName }),
  };
}

/**
 * Wraps a Lambda handler with the shared Logger/Tracer/Metrics middleware. The handler receives
 * the Observability instance instead of reaching for its own Logger/Tracer/Metrics, so every
 * handler emits the same structured JSON logs, the same X-Ray subsegment shape, and only the
 * named metric constants above.
 */
export function withObservability<TEvent, TResult>(
  serviceName: string,
  handler: (event: TEvent, obs: Observability) => Promise<TResult>,
) {
  const obs = createObservability(serviceName);
  return async (event: TEvent): Promise<TResult> => {
    obs.logger.info("handler invoked", { serviceName });
    const segment = obs.tracer.getSegment();
    const subsegment = segment?.addNewSubsegment(`## ${serviceName}`);
    if (subsegment) {
      obs.tracer.setSegment(subsegment);
    }
    try {
      const result = await handler(event, obs);
      obs.logger.info("handler completed", { serviceName });
      return result;
    } catch (error) {
      obs.logger.error("handler failed", { serviceName, error });
      throw error;
    } finally {
      obs.metrics.publishStoredMetrics();
      if (subsegment) {
        subsegment.close();
        if (segment) {
          obs.tracer.setSegment(segment);
        }
      }
    }
  };
}

/**
 * Instruments one call against an already-constructed `Observability` instance, emitting the
 * same structured JSON log entry, X-Ray subsegment and metrics flush as `withObservability`
 * above — reused here, never reimplemented (constitution Article VIII) — for code that is not
 * itself a Lambda handler entry point but still must never hand-roll its own Logger/Tracer/
 * Metrics. `withObservability` always constructs a fresh `Observability` per call (correct for a
 * Lambda handler, which owns exactly one per invocation); a port/class such as
 * `apps/api/src/adapters/duckDbParquet.ts`'s `LeadIndex` is instead handed one `Observability`
 * per Lambda invocation by its caller and reused across several method calls within that same
 * invocation — so it needs this instrument-in-place form rather than `withObservability` itself.
 */
export async function withObservabilityOperation<TResult>(
  obs: Observability,
  operationName: string,
  fn: () => Promise<TResult>,
): Promise<TResult> {
  obs.logger.info("operation invoked", { operationName });
  const segment = obs.tracer.getSegment();
  const subsegment = segment?.addNewSubsegment(`## ${operationName}`);
  if (subsegment) {
    obs.tracer.setSegment(subsegment);
  }
  try {
    const result = await fn();
    obs.logger.info("operation completed", { operationName });
    return result;
  } catch (error) {
    obs.logger.error("operation failed", { operationName, error });
    throw error;
  } finally {
    obs.metrics.publishStoredMetrics();
    if (subsegment) {
      subsegment.close();
      if (segment) {
        obs.tracer.setSegment(segment);
      }
    }
  }
}
