// 009-agent-hardening architecture fix (ADR-06 §6.1/§6.3 as actually accepted:
// docs/decisions/0000-agent-architecture.md — a two-call, code-driven design, not an AI-SDK
// tool-loop). This module used to run the *whole* turn as one `generateText({model, tools,
// stopWhen: stepCountIs(3)})` call, letting the model decide which tool to call and when to stop.
// That doesn't match the accepted ADR: the model never gets tool-calling capability at all now
// (`apps/api/src/agent/composeAnswer.ts`'s `runAsk` calls `generateOnce` with no `tools` argument
// — the strongest guarantee this AI SDK version offers that a call cannot invoke a tool, stronger
// than `toolChoice: "none"`, which not every provider honors identically). This module now owns
// only two orchestration-agnostic things: (1) `withAgentTimeout`, the 23s `AbortController`/
// `setTimeout` wrapper around the *whole* turn (every model call `runAsk` makes), mapped to a
// typed `{outcome: "timed_out"}` — never an unhandled 500, the same pattern as
// `mapIndexNotReady` in apps/api/src/routers/search.ts; and (2) `generateOnce`, a single
// no-tools `generateText` call with the Bedrock prompt-caching wiring, used for both the plan
// call and the compose call (and the plan's one repair call).
import { AGENT_TURN_LIMIT_MS } from "@crm/shared";
import { generateText, type LanguageModel, type LanguageModelUsage, type ModelMessage } from "ai";
import { MAX_OUTPUT_TOKENS_PER_CALL } from "./modelPricing.js";

// T045 (B-09, Phase 5/US2): Bedrock prompt caching (ADR-06 §6.1: "Wrap the Bedrock model (cache
// points on the system prompt and the last non-system message). Log cache read/write tokens. Put
// `cacheStrategy` in the trace metadata."). `@ai-sdk/amazon-bedrock`'s Converse mapping reads a
// cache point off `providerOptions.bedrock.cachePoint` (or the `amazonBedrock` alias) on a
// message, not off a model-level setting — see
// `@ai-sdk/amazon-bedrock/dist/index.js`'s `getCachePoint`/`pushCachePoint`, which checks
// `message.providerOptions` for the system block and for each user/assistant/tool message. There
// is no "wrap the model" API; the cache points are prompt-shaped, so this module builds the
// `system`/`prompt` as cache-annotated messages only on the Bedrock path (`generateText`'s
// `system` field accepts a `SystemModelMessage`, not only a plain string — see `ai`'s
// `Instructions = string | SystemModelMessage | Array<SystemModelMessage>`). The Gateway path
// (`getModel.ts`'s other branch) has no equivalent control and keeps the original plain
// `system`/`prompt` strings untouched. Applied identically to both the plan call and the compose
// call (previously wrapped only the one tool-loop call).
const BEDROCK_CACHE_POINT_PROVIDER_OPTIONS = { bedrock: { cachePoint: { type: "default" } } };

/** Trace-metadata label for `AgentAnswer.trace.cacheStrategy` (ADR §6.1) — `"none"` when the
 *  model isn't Bedrock (the Gateway path has no cache-point control to report). */
export type CacheStrategy = "bedrock:system+last-message" | "none";

/** `@ai-sdk/amazon-bedrock`'s language model sets `provider: "amazon-bedrock"` (see
 *  `createAmazonBedrock(...)`'s model classes) — the one place this module can detect "we are on
 *  the Bedrock path" without threading `AI_PROVIDER` through as a second signal that could drift
 *  from the model actually passed in. */
export function isBedrockModel(model: LanguageModel): boolean {
  return typeof model !== "string" && model.provider === "amazon-bedrock";
}

/** ADR-06 §6.1 / contracts/agent-api.md step 9: the server aborts at 23s, inside the Lambda's own
 *  28s timeout and the HTTP API's 29-30s limit (nested on purpose, Task A AD-27-style layering).
 *  This now wraps the whole `runAsk` turn (plan + repair + dispatch + compose), not just one
 *  `generateText` call. The value is `@crm/shared`'s `AGENT_TURN_LIMIT_MS`, the same constant
 *  the Ask screen's timed-out copy reads, so the two can't drift. */
export const RUN_AGENT_TIMEOUT_MS = AGENT_TURN_LIMIT_MS;

/** ADR-06 §6.1: "At most 3 model calls" this turn. Unlike the old tool-loop (`stopWhen:
 *  stepCountIs(3)`, a model-driven stop condition), this budget is now enforced structurally by
 *  `composeAnswer.ts`'s `runAsk`: it calls `generateOnce` at most 3 times in its own fixed
 *  control flow (plan, at most 1 repair, compose) — there is no loop a model's own output could
 *  extend further. This constant documents that ceiling; nothing reads it at runtime to decide
 *  whether to make another call. */
export const RUN_AGENT_MAX_MODEL_CALLS = 3;

/** True for the AI SDK's own `AbortError` (thrown by `generateText` when `abortSignal` fires)
 *  and, defensively, for any error surfacing after the controller has already aborted — the same
 *  defensive-OR `mapIndexNotReady`-style typed-error mapping used elsewhere in this router layer. */
function isAbortError(error: unknown, controller: AbortController): boolean {
  if (controller.signal.aborted) return true;
  return error instanceof Error && error.name === "AbortError";
}

export type AgentTimeoutResult<T> =
  | { readonly outcome: "ok"; readonly result: T }
  | { readonly outcome: "timed_out" };

/** Runs `run` under one 23s `AbortController`/`setTimeout` for the whole turn. Never throws on a
 *  timeout — callers get a typed `{outcome: "timed_out"}` instead, exactly like
 *  `IndexNotReadyError`'s mapping in `routers/search.ts`. Any other failure (a genuine model/tool
 *  error) is rethrown, since that is not a timeout and the caller's own error mapping (TRPCError)
 *  is the right place for it. `run` receives the `AbortSignal` so every `generateOnce` call this
 *  turn makes aborts together, not just the one in flight when the timer fires. */
export async function withAgentTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
): Promise<AgentTimeoutResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_AGENT_TIMEOUT_MS);
  try {
    const result = await run(controller.signal);
    return { outcome: "ok", result };
  } catch (error) {
    if (isAbortError(error, controller)) {
      return { outcome: "timed_out" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface GenerateOnceInput {
  readonly model: LanguageModel;
  readonly system: string;
  readonly prompt: string;
}

/** One model call's token usage (CR finding 5), normalised from the AI SDK's `usage`:
 *  `inputTokens` is the *non-cached* input count (cache reads/writes are priced differently, see
 *  agent/modelPricing.ts), so the four fields never double-count. Absent = provider didn't say. */
export interface ModelCallUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

export interface GenerateOnceResult {
  readonly text: string;
  readonly cacheStrategy: CacheStrategy;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly usage: ModelCallUsage;
}

function definedOnly(usage: Record<keyof ModelCallUsage, number | undefined>): ModelCallUsage {
  return Object.fromEntries(
    Object.entries(usage).filter(([, v]) => v !== undefined),
  ) as ModelCallUsage;
}

/** Shared with agent/usageMeter.ts: AI SDK total input includes cached tokens; when the provider
 *  doesn't split out the non-cached part, derive it so input is never charged twice. */
export function nonCachedInput(
  total: number | undefined,
  noCache: number | undefined,
  cacheRead: number | undefined,
  cacheWrite: number | undefined,
): number | undefined {
  if (noCache !== undefined) return noCache;
  if (total === undefined) return undefined;
  return Math.max(0, total - (cacheRead ?? 0) - (cacheWrite ?? 0));
}

function toModelCallUsage(usage: LanguageModelUsage): ModelCallUsage {
  const details = usage.inputTokenDetails;
  return definedOnly({
    inputTokens: nonCachedInput(
      usage.inputTokens,
      details?.noCacheTokens,
      details?.cacheReadTokens,
      details?.cacheWriteTokens,
    ),
    outputTokens: usage.outputTokens,
    cacheReadTokens: details?.cacheReadTokens,
    cacheWriteTokens: details?.cacheWriteTokens,
  });
}

/** One single-step, **no-tools** `generateText` call (ADR §6.1's "plan call"/"compose call" — the
 *  model is never given `tools` at all, which is a stronger guarantee of "cannot call a tool"
 *  than `toolChoice: "none"`, which not every provider honors identically). Used for the plan
 *  call, the plan's one repair call, and the compose call — all three are this same shape, only
 *  the system/prompt text differs. */
export async function generateOnce(
  input: GenerateOnceInput,
  signal: AbortSignal,
): Promise<GenerateOnceResult> {
  const useBedrockCaching = isBedrockModel(input.model);
  const cacheStrategy: CacheStrategy = useBedrockCaching ? "bedrock:system+last-message" : "none";

  // Cache points per ADR §6.1: one on the system prompt, one on the last (here, the only)
  // non-system message. Both are plain-string `system`/`prompt` on the Gateway path (no cache
  // control exists there), and cache-annotated `SystemModelMessage`/`ModelMessage[]` on Bedrock.
  const system = useBedrockCaching
    ? {
        role: "system" as const,
        content: input.system,
        providerOptions: BEDROCK_CACHE_POINT_PROVIDER_OPTIONS,
      }
    : input.system;
  const prompt: string | ModelMessage[] = useBedrockCaching
    ? [
        {
          role: "user" as const,
          content: input.prompt,
          providerOptions: BEDROCK_CACHE_POINT_PROVIDER_OPTIONS,
        },
      ]
    : input.prompt;

  const result = await generateText({
    model: input.model,
    // No `tools` field at all — see this module's header. There is nothing for either the plan
    // call or the compose call to look up any more; retrieval is `composeAnswer.ts`'s
    // `dispatchPlan`, called from plain TypeScript between these two model calls, never by the
    // model itself.
    system,
    prompt,
    // CR finding 7: the turn's one 23 s AbortSignal reaches the provider request itself, and the
    // SDK never retries on its own (its default is 2 retries) — the only extra model call a turn
    // may make is composeAnswer.ts's one plan-repair call, which keeps the ≤3-calls bound and
    // the spend reservation (agent/modelPricing.ts) honest.
    abortSignal: signal,
    maxRetries: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS_PER_CALL,
  });

  const cacheReadTokens = result.usage.inputTokenDetails?.cacheReadTokens;
  const cacheWriteTokens = result.usage.inputTokenDetails?.cacheWriteTokens;

  return {
    text: result.text,
    cacheStrategy,
    ...(cacheReadTokens === undefined ? {} : { cacheReadTokens }),
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    usage: toModelCallUsage(result.usage),
  };
}
