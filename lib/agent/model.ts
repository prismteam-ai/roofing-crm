import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { getEnv } from "@/lib/config/env";

/**
 * Model factory. All LLM calls go through the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`).
 * The model id defaults to `claude-sonnet-4-5` and is overridable via `AGENT_MODEL`.
 *
 * @module agent/model
 */
export function getAgentModel(): LanguageModel {
  return anthropic(getEnv().AGENT_MODEL);
}
