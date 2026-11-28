import { generateText, type LanguageModel, type ModelMessage, stepCountIs, type ToolSet } from "ai";
import type { z } from "zod";
import { systemPrompt } from "./prompt.ts";
import { AgentAnswer, AgentRequest, type AgentRequest as AgentRequestT } from "./schema.ts";
import { summarizeRuns, type ToolRun } from "./summarize.ts";

export const DEFAULT_AGENT_MODEL = "claude-opus-5-5";
export const MAX_STEPS = 8;

export class AgentTimeoutError extends Error {
  override name = "AgentTimeoutError";
}

export interface RoofingAgent {
  readonly modelId: string;
  ask(input: z.input<typeof AgentRequest>): Promise<AgentAnswer>;
}

/**
 * Vercel AI SDK tool loop over the Oracle MCP tools. The text comes from the model; steps,
 * results, citations, assumptions and the follow-up context come from the step results.
 */
export function createRoofingAgent(deps: {
  tools: ToolSet;
  model: LanguageModel;
  modelId: string;
  timeoutMs?: number;
}): RoofingAgent {
  return {
    modelId: deps.modelId,
    async ask(input) {
      const req: AgentRequestT = AgentRequest.parse(input);
      const previous = [...req.history]
        .reverse()
        .find((t) => t.role === "assistant" && t.context?.center)?.context;
      const messages: ModelMessage[] = [
        ...req.history.map((t) => ({ role: t.role, content: t.content }) as ModelMessage),
        { role: "user", content: req.message },
      ];
      let result;
      try {
        result = await generateText({
          model: deps.model,
          system: systemPrompt({ previous, mapContext: req.mapContext }),
          messages,
          tools: deps.tools,
          stopWhen: stepCountIs(MAX_STEPS),
          abortSignal: AbortSignal.timeout(deps.timeoutMs ?? 60_000),
          maxRetries: 1,
        });
      } catch (err) {
        const e = err as Error;
        if (
          e?.name === "AbortError" ||
          e?.name === "TimeoutError" ||
          /abort|timed? ?out/i.test(e?.message ?? "")
        )
          throw new AgentTimeoutError("model call timed out");
        throw err;
      }
      const runs: ToolRun[] = result.steps.flatMap((s: any) => [
        ...(s.toolResults ?? []).map((tr: any) => ({
          tool: tr.toolName,
          args: (tr.input ?? {}) as Record<string, unknown>,
          output: tr.output,
        })),
        ...(s.content ?? [])
          .filter((c: any) => c.type === "tool-error")
          .map((c: any) => ({
            tool: c.toolName,
            args: (c.input ?? {}) as Record<string, unknown>,
            output: null,
            error: String(c.error?.message ?? c.error ?? "tool failed"),
          })),
      ]);
      const text = result.text?.trim() || "I could not produce an answer from the tool results.";
      const usage: any = (result as any).totalUsage ?? result.usage;
      return AgentAnswer.parse({
        text,
        ...summarizeRuns(runs, { text, message: req.message, previous, mapContext: req.mapContext }),
        model: deps.modelId,
        usage: { totalTokens: Number(usage?.totalTokens ?? 0) || 0 },
      });
    },
  };
}
