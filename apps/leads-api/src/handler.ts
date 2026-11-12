/** Leads API Lambda (HTTP API, payload 2.0, behind the shared token authorizer). */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  Context,
} from "aws-lambda";
import { appRouter } from "./router.ts";
import type { Ctx, LoggerLike, MetricsLike } from "./trpc.ts";

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();
/** X-Ray-traced DynamoDB client (kit: capture the DynamoDB client). */
const db = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(new DynamoDBClient({})),
);
const loggerLike: LoggerLike = {
  info: (m, e) => logger.info(m, e ?? {}),
  warn: (m, e) => logger.warn(m, e ?? {}),
  error: (m, e) => logger.error(m, e as Error),
};
const metricsLike: MetricsLike = {
  addMetric: (name, unit, value) =>
    metrics.addMetric(name, MetricUnit[unit], value),
};

type Event = APIGatewayProxyEventV2WithLambdaAuthorizer<{ client?: string }>;

const trpc = awsLambdaRequestHandler({
  router: appRouter,
  createContext: ({ event }): Ctx => ({
    db,
    tableName: process.env.TABLE_NAME!,
    client: (event as Event).requestContext.authorizer?.lambda?.client,
    logger: loggerLike,
    metrics: metricsLike,
    now: () => new Date(),
  }),
  onError: ({ error, path }) => {
    // Never log inputs (notes are free text).
    if (error.code === "INTERNAL_SERVER_ERROR")
      logger.error("procedure failed", {
        path,
        error: error.cause?.name ?? error.name,
      });
    else logger.warn("procedure rejected", { path, code: error.code });
  },
});

export const handler = async (event: Event, context: Context) => {
  logger.addContext(context);
  try {
    return await trpc(event, context);
  } finally {
    metrics.publishStoredMetrics();
  }
};
