import type { LanguageModel, ToolSet } from "ai";
import { AgentTimeoutError, createRoofingAgent } from "./agent.ts";
import type { BudgetGuard } from "./budget.ts";
import { OracleMcpUnavailable } from "./mcp-tools.ts";
import { AgentRequest } from "./schema.ts";

export interface AgentHttpResult {
  status: number;
  body: unknown;
}
export type AgentHttpHandler = (body: unknown, ip: string) => Promise<AgentHttpResult>;

/**
 * POST /agent: budget check (before any model call), validation, MCP connect per request, the
 * model call with a timeout, and friendly failures that never carry invented results.
 */
export function createAgentHandler(deps: {
  connect(): Promise<{ tools: ToolSet; close(): Promise<void> }>;
  model: LanguageModel;
  modelId: string;
  budget: BudgetGuard;
  timeoutMs?: number;
  onError?(e: unknown): void;
}): AgentHttpHandler {
  return async (body, ip) => {
    const parsed = AgentRequest.safeParse(body);
    if (!parsed.success)
      return { status: 400, body: { error: "Please type a question (up to 4,000 characters)." } };
    const denied = await deps.budget.allow(ip);
    if (denied) return { status: 429, body: { error: denied } };
    let conn: Awaited<ReturnType<typeof deps.connect>> | undefined;
    try {
      conn = await deps.connect();
      const agent = createRoofingAgent({
        tools: conn.tools,
        model: deps.model,
        modelId: deps.modelId,
        timeoutMs: deps.timeoutMs,
      });
      const answer = await agent.ask(parsed.data);
      await deps.budget.record(answer.usage.totalTokens).catch(() => {});
      return { status: 200, body: answer };
    } catch (e) {
      deps.onError?.(e);
      if (e instanceof OracleMcpUnavailable)
        return {
          status: 503,
          body: {
            error:
              "The property data service is unreachable right now, so no results were produced. Please try again shortly.",
          },
        };
      if (e instanceof AgentTimeoutError)
        return {
          status: 504,
          body: { error: "The assistant took too long to answer. Try a narrower question." },
        };
      return { status: 502, body: { error: "The assistant could not answer right now. Please try again." } };
    } finally {
      await conn?.close().catch(() => {});
    }
  };
}
