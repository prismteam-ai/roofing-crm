import { createAnthropic } from "@ai-sdk/anthropic";
import {
  createAgentHandler,
  dynamoBudget,
  loadOracleTools,
  memoryBudget,
  type AgentHttpHandler,
} from "@crm/agent";
import { documentClient } from "@crm/leads-db";
import type { Env } from "./env.ts";

/** The Claude API key: from the environment (local) or SSM Parameter Store (hosted). */
export async function anthropicKey(env: Env): Promise<string | null> {
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  if (!env.ANTHROPIC_API_KEY_PARAM) return null;
  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const r = await new SSMClient({}).send(
    new GetParameterCommand({ Name: env.ANTHROPIC_API_KEY_PARAM, WithDecryption: true }),
  );
  return r.Parameter?.Value ?? null;
}

/** POST /agent handler, or a handler that explains the agent is not configured. */
export async function createAgentEndpoint(
  env: Env,
  opts: { onError?(e: unknown): void } = {},
): Promise<AgentHttpHandler> {
  const key = await anthropicKey(env);
  if (!key) {
    return async () => ({
      status: 503,
      body: { error: "The assistant is not configured on this server (no Claude API key)." },
    });
  }
  const limits = {
    requestsPerIpPerMinute: env.RATE_LIMIT_PER_MINUTE,
    dailyTokens: env.AGENT_DAILY_TOKEN_BUDGET,
  };
  const budget =
    env.DYNAMODB_ENDPOINT || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? dynamoBudget({
          doc: documentClient({ endpoint: env.DYNAMODB_ENDPOINT }),
          tableName: env.LEADS_TABLE,
          limits,
        })
      : memoryBudget(limits);
  return createAgentHandler({
    connect: () => loadOracleTools({ url: env.ORACLE_MCP_URL }),
    model: createAnthropic({ apiKey: key })(env.CRM_AGENT_MODEL),
    modelId: env.CRM_AGENT_MODEL,
    budget,
    timeoutMs: env.AGENT_TIMEOUT_MS,
    onError: opts.onError,
  });
}
