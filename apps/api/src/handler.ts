/**
 * AWS Lambda entrypoint for the tRPC API.
 *
 * Wires Powertools Logger, Tracer, and Metrics into ApiContext and serves
 * procedures through the AWS Lambda adapter (HTTP API / API Gateway v2 events).
 */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import {
  awsLambdaRequestHandler,
  type CreateAWSLambdaContextOptions,
} from "@trpc/server/adapters/aws-lambda";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createLambdaAppRouter } from "./create-lambda-app-router.js";
import { isMcpWarmupEvent, MCP_WARMUP_SEARCH_INPUT } from "./mcp-warmup-event.js";
import {
  ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS,
  ELEPHANT_MCP_TOOL_TIMEOUT_MS,
  elephantMcpTimeoutStore,
} from "./elephant-mcp-stdio-tool-client.js";
import { appRouter as unconfiguredAppRouter } from "./routers/health.js";
import type { ApiContext } from "./trpc.js";

const serviceName = "roofing-crm-api";

const logger = new Logger({ serviceName });
const tracer = new Tracer({ serviceName });
const metrics = new Metrics({ serviceName, namespace: "RoofingCrmApi" });

/**
 * True when running inside AWS Lambda (not local Vitest imports).
 *
 * Bracket access prevents esbuild from inlining env at bundle time.
 */
function isLambdaRuntime(): boolean {
  const lambdaFunctionName = process.env["AWS_LAMBDA_FUNCTION_NAME"];
  return lambdaFunctionName !== undefined && lambdaFunctionName.length > 0;
}

/**
 * Lambda always uses the production router (DynamoDB + Elephant MCP).
 * Local Vitest keeps the stub unless LEAD_RECORD_TABLE_NAME is set.
 */
function resolveAppRouter() {
  if (isLambdaRuntime()) {
    return createLambdaAppRouter();
  }
  const leadRecordTableName = process.env["LEAD_RECORD_TABLE_NAME"];
  if (leadRecordTableName !== undefined && leadRecordTableName.length > 0) {
    return createLambdaAppRouter();
  }
  return unconfiguredAppRouter;
}

const appRouter = resolveAppRouter();

const createContext = (
  _options: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>,
): ApiContext => ({
  logger,
  tracer,
  metrics,
});

const trpcHandler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
  onError({ error, path, type }) {
    logger.error("tRPC procedure failed", {
      path: path ?? "unknown",
      type,
      code: error.code,
      message: error.message,
    });
  },
});

/**
 * HTTP API events go to tRPC. EventBridge MCP warmup invokes search.inRadius
 * so DuckDB stays loaded inside the frozen Lambda container.
 */
export async function handler(
  event: unknown,
  context: Parameters<typeof trpcHandler>[1],
) {
  if (isMcpWarmupEvent(event)) {
    return elephantMcpTimeoutStore.run(
      { queryPropertiesTimeoutMs: ELEPHANT_MCP_TOOL_TIMEOUT_MS },
      async () => {
        const caller = appRouter.createCaller({
          logger,
          tracer,
          metrics,
        });
        await caller.search.inRadius(MCP_WARMUP_SEARCH_INPUT);
        logger.info("mcp.warmup.ok", {
          county: MCP_WARMUP_SEARCH_INPUT.county,
        });
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
      },
    );
  }
  return elephantMcpTimeoutStore.run(
    { queryPropertiesTimeoutMs: ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS },
    () => trpcHandler(event as APIGatewayProxyEventV2, context),
  );
}

export { appRouter };
export type { AppRouter } from "./routers/health.js";
export type { ApiContext };
