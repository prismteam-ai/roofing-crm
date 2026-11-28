import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { AgentHttpHandler } from "@crm/agent";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";
import { createAgentEndpoint } from "./agent.ts";
import { loadEnv } from "./env.ts";

const logger = new Logger({ serviceName: "roofing-crm-agent" });
const metrics = new Metrics({ namespace: "RoofingCrm", serviceName: "roofing-crm-agent" });
const tracer = new Tracer({ serviceName: "roofing-crm-agent" });

/**
 * Lambda Function URL handler for POST /agent (a Function URL allows the model call longer than
 * API Gateway's 30 s). CORS is configured on the Function URL itself, limited to the Amplify domain.
 */
export function createAgentLambda(agent: AgentHttpHandler) {
  return async (
    event: APIGatewayProxyEventV2,
    context: LambdaContext,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    logger.addContext(context);
    const json = (statusCode: number, body: unknown) => ({
      statusCode,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    try {
      if (event.requestContext.http.method !== "POST") return json(405, { error: "POST a question" });
      let body: unknown;
      try {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body ?? "", "base64").toString("utf8")
          : (event.body ?? "");
        body = JSON.parse(raw || "{}");
      } catch {
        return json(400, { error: "invalid JSON" });
      }
      const r = await agent(body, event.requestContext.http.sourceIp);
      metrics.addMetric(r.status === 200 ? "AgentAnswers" : `AgentStatus${r.status}`, MetricUnit.Count, 1);
      const tokens = (r.body as { usage?: { totalTokens?: number } })?.usage?.totalTokens;
      if (tokens) metrics.addMetric("AgentTokens", MetricUnit.Count, tokens);
      return json(r.status, r.body);
    } finally {
      metrics.publishStoredMetrics();
    }
  };
}

let cached: Promise<ReturnType<typeof createAgentLambda>> | undefined;

export async function handler(event: APIGatewayProxyEventV2, context: LambdaContext) {
  tracer.annotateColdStart();
  tracer.addServiceNameAnnotation();
  cached ??= createAgentEndpoint(loadEnv(), {
    onError: (e) => logger.error("agent failed", { error: e as Error }),
  }).then(createAgentLambda);
  return (await cached)(event, context);
}
