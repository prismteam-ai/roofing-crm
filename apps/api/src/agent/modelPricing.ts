// CR finding 5 (B-09 review): the one constants module for agent model cost. The spend cap
// (agent/spendCap.ts, $10/day/user, NFR-001) reserves a conservative estimate before the first model
// call and reconciles to the real, token-metered cost after the turn; both numbers come from here.
//
// Prices are USD per million tokens, Anthropic list price for the model family, and the entry is
// selected by the deployed `AGENT_MODEL_ID` (config, never a literal in agent code — constitution
// VI). A model id with no entry fails closed (`UnpricedModelError`): an unknown price means the
// cap can't be enforced, so no ask runs.
//
// Sources (checked 2026-10-24): Claude Sonnet 4.6 list price $3 input / $15 output per MTok; prompt
// cache write (5-minute TTL) is 1.25x input = $3.75, cache read is 0.1x input = $0.30. Amazon
// Bedrock bills Claude separately from Anthropic's API (https://aws.amazon.com/bedrock/pricing/);
// for this model family its geographic cross-region inference profiles (`eu.`/`us.`/...) are
// priced at a premium over the global profile, so Bedrock geo-profile ids are charged at list x
// BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER. If that premium is ever lower than assumed, the cap only
// errs on the conservative side (charges slightly more than AWS bills). Re-check both pages when
// the model id changes.
import type { ModelCallUsage } from "./runAgent.js";

export interface ModelPrice {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
  readonly cacheWriteUsdPerMTok: number;
  readonly cacheReadUsdPerMTok: number;
}

/** Premium for a Bedrock *geographic* inference profile over the global/list price. */
export const BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER = 1.1;

/** Bedrock geographic inference-profile prefixes (`<geo>.<foundation model id>`). */
const BEDROCK_GEO_PREFIXES = ["eu", "us", "apac", "jp", "au", "ca", "us-gov"] as const;

const SONNET_4_6: ModelPrice = {
  inputUsdPerMTok: 3,
  outputUsdPerMTok: 15,
  cacheWriteUsdPerMTok: 3.75,
  cacheReadUsdPerMTok: 0.3,
};

/** Keyed by the provider's own base model id: Bedrock foundation-model id (geo prefix stripped),
 *  or the Vercel AI Gateway id. */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "anthropic.claude-sonnet-4-6": SONNET_4_6,
  "anthropic/claude-sonnet-4.6": SONNET_4_6,
};

/** Upper bound on output tokens per model call — passed to every `generateOnce` call as
 *  `maxOutputTokens`, so the reservation below is a real ceiling, not a guess. Sized for the
 *  compose call's JSON (claims of <=400 chars over <=25 rows, plus citations). */
export const MAX_OUTPUT_TOKENS_PER_CALL = 4096;

/** Conservative input-token budget per call: the plan system prompt + question, or the compose
 *  system prompt + <=25 compact property rows + <=25 permit rows as JSON. Charged at the
 *  cache-*write* price (the most expensive input rate) for the reservation. */
export const ESTIMATED_INPUT_TOKENS_PER_CALL = 8000;

const TOKENS_PER_MTOK = 1_000_000;
const CENTS_PER_USD = 100;

export class UnpricedModelError extends Error {
  constructor(readonly modelId: string) {
    super(
      `modelPricing: no price entry for model "${modelId}" — the daily spend cap can't be computed, refusing to run the agent.`,
    );
    this.name = "UnpricedModelError";
  }
}

export function priceForModel(modelId: string): ModelPrice {
  const direct = MODEL_PRICES[modelId];
  if (direct !== undefined) return direct;
  const dot = modelId.indexOf(".");
  const geo = dot > 0 ? modelId.slice(0, dot) : undefined;
  if (geo !== undefined && (BEDROCK_GEO_PREFIXES as readonly string[]).includes(geo)) {
    const base = MODEL_PRICES[modelId.slice(dot + 1)];
    if (base !== undefined) {
      const m = BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER;
      return {
        inputUsdPerMTok: base.inputUsdPerMTok * m,
        outputUsdPerMTok: base.outputUsdPerMTok * m,
        cacheWriteUsdPerMTok: base.cacheWriteUsdPerMTok * m,
        cacheReadUsdPerMTok: base.cacheReadUsdPerMTok * m,
      };
    }
  }
  throw new UnpricedModelError(modelId);
}

function usdToCents(usdPerMTok: number, tokens: number): number {
  return ((usdPerMTok * tokens) / TOKENS_PER_MTOK) * CENTS_PER_USD;
}

/** The conservative reservation for `calls` model calls. */
export function estimateCents(price: ModelPrice, calls: number): number {
  const perCall =
    usdToCents(price.cacheWriteUsdPerMTok, ESTIMATED_INPUT_TOKENS_PER_CALL) +
    usdToCents(price.outputUsdPerMTok, MAX_OUTPUT_TOKENS_PER_CALL);
  return perCall * calls;
}

/** Real cost of one call. `inputTokens` is the *non-cached* input count. A call whose provider
 *  reported no input/output usage at all is charged at the per-call estimate, never at zero. */
export function costCents(price: ModelPrice, usage: ModelCallUsage): number {
  if (usage.inputTokens === undefined && usage.outputTokens === undefined) {
    return estimateCents(price, 1);
  }
  return (
    usdToCents(price.inputUsdPerMTok, usage.inputTokens ?? 0) +
    usdToCents(price.cacheReadUsdPerMTok, usage.cacheReadTokens ?? 0) +
    usdToCents(price.cacheWriteUsdPerMTok, usage.cacheWriteTokens ?? 0) +
    usdToCents(price.outputUsdPerMTok, usage.outputTokens ?? 0)
  );
}
