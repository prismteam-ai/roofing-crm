// CR finding 5: real per-call cost from a documented, config-selected price table (one constants
// module, no magic numbers inline), and a conservative pre-call reservation for <=3 Sonnet calls.
import { describe, expect, it } from "vitest";
import {
  BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER,
  costCents,
  estimateCents,
  ESTIMATED_INPUT_TOKENS_PER_CALL,
  MAX_OUTPUT_TOKENS_PER_CALL,
  priceForModel,
  UnpricedModelError,
} from "../../src/agent/modelPricing.js";
import { RUN_AGENT_MAX_MODEL_CALLS } from "../../src/agent/runAgent.js";

describe("modelPricing", () => {
  it("prices the deployed EU inference profile at Sonnet 4.6 list price plus the geo-profile premium", () => {
    const price = priceForModel("eu.anthropic.claude-sonnet-4-6");
    expect(BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER).toBeGreaterThanOrEqual(1);
    expect(price.inputUsdPerMTok).toBeCloseTo(3 * BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER);
    expect(price.outputUsdPerMTok).toBeCloseTo(15 * BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER);
    expect(price.cacheWriteUsdPerMTok).toBeCloseTo(3.75 * BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER);
    expect(price.cacheReadUsdPerMTok).toBeCloseTo(0.3 * BEDROCK_GEO_PROFILE_PRICE_MULTIPLIER);
  });

  it("prices the Gateway id at list price (no Bedrock geo premium)", () => {
    const price = priceForModel("anthropic/claude-sonnet-4.6");
    expect(price.inputUsdPerMTok).toBe(3);
    expect(price.outputUsdPerMTok).toBe(15);
  });

  it("fails closed on a model id with no price entry (the spend cap can't be computed)", () => {
    expect(() => priceForModel("eu.some.unknown-model")).toThrow(UnpricedModelError);
  });

  it("computes cents from non-cached input, cache read/write and output tokens", () => {
    const price = priceForModel("anthropic/claude-sonnet-4.6");
    // 1M uncached in = $3, 1M out = $15, 1M cache write = $3.75, 1M cache read = $0.30
    expect(
      costCents(price, {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo((3 + 15 + 3.75 + 0.3) * 100);
    expect(costCents(price, { inputTokens: 2000, outputTokens: 500 })).toBeCloseTo(
      ((2000 * 3 + 500 * 15) / 1_000_000) * 100,
    );
  });

  it("charges a call with unknown usage at the conservative per-call estimate", () => {
    const price = priceForModel("eu.anthropic.claude-sonnet-4-6");
    expect(costCents(price, {})).toBeCloseTo(estimateCents(price, 1));
  });

  it("reserves a conservative ceiling for the whole <=3-call turn", () => {
    const price = priceForModel("eu.anthropic.claude-sonnet-4-6");
    const perCall =
      ((ESTIMATED_INPUT_TOKENS_PER_CALL * price.cacheWriteUsdPerMTok +
        MAX_OUTPUT_TOKENS_PER_CALL * price.outputUsdPerMTok) /
        1_000_000) *
      100;
    expect(estimateCents(price, RUN_AGENT_MAX_MODEL_CALLS)).toBeCloseTo(perCall * 3);
    // Realistic for Sonnet: well above the old flat 1 cent, well under the 300-cent daily cap.
    expect(estimateCents(price, RUN_AGENT_MAX_MODEL_CALLS)).toBeGreaterThan(10);
    expect(estimateCents(price, RUN_AGENT_MAX_MODEL_CALLS)).toBeLessThan(50);
  });
});
