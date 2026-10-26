// CR finding 5: meters every model call of one `agent.ask` turn at the model boundary, via AI SDK
// language-model middleware (`wrapLanguageModel`) — so composeAnswer.ts's orchestration doesn't
// have to thread usage back out of each of its `generateOnce` call sites, and a call that never
// returns usage (aborted at 23 s, provider error, a stream) is still counted. The router wraps the
// turn's model once, runs the turn, then reconciles the spend-cap reservation to
// `meteredCostCents`.
import { wrapLanguageModel, type LanguageModel } from "ai";
import { costCents, estimateCents, type ModelPrice } from "./modelPricing.js";
import { nonCachedInput, type ModelCallUsage } from "./runAgent.js";

export interface UsageSnapshot {
  /** Model calls started this turn (completed or not). */
  readonly started: number;
  /** Usage of each call that completed, in order. */
  readonly completed: readonly ModelCallUsage[];
}

export interface UsageMeter {
  readonly model: LanguageModel;
  snapshot(): UsageSnapshot;
}

type ModelObject = Exclude<LanguageModel, string>;

export function meterModel(model: ModelObject): UsageMeter {
  let started = 0;
  const completed: ModelCallUsage[] = [];

  const wrapped = wrapLanguageModel({
    model,
    middleware: {
      wrapGenerate: async ({ doGenerate }) => {
        started += 1;
        const result = await doGenerate();
        const { inputTokens, outputTokens } = result.usage;
        const usage: Record<keyof ModelCallUsage, number | undefined> = {
          inputTokens: nonCachedInput(
            inputTokens.total,
            inputTokens.noCache,
            inputTokens.cacheRead,
            inputTokens.cacheWrite,
          ),
          outputTokens: outputTokens.total,
          cacheReadTokens: inputTokens.cacheRead,
          cacheWriteTokens: inputTokens.cacheWrite,
        };
        completed.push(
          Object.fromEntries(
            Object.entries(usage).filter(([, v]) => v !== undefined),
          ) as ModelCallUsage,
        );
        return result;
      },
      // No agent path streams today; if one ever does, it's counted as started-but-unreported
      // (charged at the per-call estimate) rather than slipping past the cap uncounted.
      wrapStream: async ({ doStream }) => {
        started += 1;
        return doStream();
      },
    },
  });

  return {
    model: wrapped,
    snapshot: () => ({ started, completed: [...completed] }),
  };
}

/** Measured cost of the turn: each completed call at its real token cost, each call that started
 *  but never reported usage at the conservative per-call estimate. */
export function meteredCostCents(price: ModelPrice, snapshot: UsageSnapshot): number {
  const measured = snapshot.completed.reduce((sum, usage) => sum + costCents(price, usage), 0);
  const unreported = Math.max(0, snapshot.started - snapshot.completed.length);
  return measured + estimateCents(price, unreported);
}
