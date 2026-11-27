import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  awsLambdaRequestHandler,
  type CreateAWSLambdaContextOptions,
} from "@trpc/server/adapters/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from "aws-lambda";
import { type Context, createContextFactory, type Deps } from "./context.ts";
import { createDeps } from "./deps.ts";
import { loadEnv } from "./env.ts";
import { appRouter } from "./router.ts";

const logger = new Logger({ serviceName: "roofing-crm-api" });
const metrics = new Metrics({ namespace: "RoofingCrm", serviceName: "roofing-crm-api" });
const tracer = new Tracer({ serviceName: "roofing-crm-api" });

/** The tRPC router behind API Gateway (HTTP API, payload v2), with Powertools logging, metrics and tracing. */
export function createLambdaHandler(deps: Deps) {
  const createContext = createContextFactory(deps, { secureCookies: true });
  const trpc = awsLambdaRequestHandler({
    router: appRouter,
    createContext: ({ event }: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) =>
      createContext({ cookieHeader: event.cookies?.join("; ") ?? event.headers?.cookie }),
    responseMeta: ({ ctx }) => {
      const c = ctx as Context | undefined;
      return c?.setCookies.length ? { headers: { "set-cookie": c.setCookies } } : {};
    },
    onError: ({ error, path }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") logger.error("trpc error", { path, error });
      else logger.warn("trpc client error", { path, code: error.code, message: error.message });
    },
  });
  return async (event: APIGatewayProxyEventV2, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
    logger.addContext(context);
    try {
      const res = await trpc(event, context);
      metrics.addMetric("Requests", MetricUnit.Count, 1);
      return res;
    } finally {
      metrics.publishStoredMetrics();
    }
  };
}

let cached: ReturnType<typeof createLambdaHandler> | undefined;

export async function handler(event: APIGatewayProxyEventV2, context: LambdaContext) {
  tracer.annotateColdStart();
  tracer.addServiceNameAnnotation();
  cached ??= createLambdaHandler(createDeps(loadEnv()));
  return cached(event, context);
}
