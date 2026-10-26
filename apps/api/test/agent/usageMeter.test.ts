// CR finding 5: every model call this turn is metered at the model boundary (AI SDK middleware),
// so the spend-cap reconcile charges real token usage — and charges an aborted/failed call (whose
// usage is never reported) at the conservative per-call estimate rather than at zero.
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { estimateCents, priceForModel } from "../../src/agent/modelPricing.js";
import { meterModel, meteredCostCents } from "../../src/agent/usageMeter.js";

function okResult(input: number, output: number, cacheRead?: number, cacheWrite?: number) {
  return {
    content: [{ type: "text" as const, text: "ok" }],
    finishReason: { unified: "stop" as const, raw: "end_turn" },
    usage: {
      inputTokens: {
        total: input + (cacheRead ?? 0) + (cacheWrite ?? 0),
        noCache: input,
        cacheRead,
        cacheWrite,
      },
      outputTokens: { total: output, text: output, reasoning: undefined },
    },
    warnings: [],
  };
}

const PRICE = priceForModel("eu.anthropic.claude-sonnet-4-6");

describe("usageMeter", () => {
  it("keeps the wrapped model's provider and id (Bedrock cache-point detection depends on it)", () => {
    const inner = new MockLanguageModelV4({ provider: "amazon-bedrock", modelId: "m-1" });
    const { model } = meterModel(inner);
    expect(typeof model === "string" ? model : model.provider).toBe("amazon-bedrock");
    expect(typeof model === "string" ? model : model.modelId).toBe("m-1");
  });

  it("records each completed call's input/output/cache tokens", async () => {
    const inner = new MockLanguageModelV4({
      doGenerate: [okResult(1000, 200, 300, 50), okResult(500, 100)],
    });
    const meter = meterModel(inner);
    await generateText({ model: meter.model, prompt: "a", maxRetries: 0 });
    await generateText({ model: meter.model, prompt: "b", maxRetries: 0 });

    const snap = meter.snapshot();
    expect(snap.started).toBe(2);
    expect(snap.completed).toEqual([
      { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 50 },
      { inputTokens: 500, outputTokens: 100 },
    ]);
    expect(meteredCostCents(PRICE, snap)).toBeCloseTo(
      ((1000 * PRICE.inputUsdPerMTok +
        300 * PRICE.cacheReadUsdPerMTok +
        50 * PRICE.cacheWriteUsdPerMTok +
        200 * PRICE.outputUsdPerMTok +
        500 * PRICE.inputUsdPerMTok +
        100 * PRICE.outputUsdPerMTok) /
        1_000_000) *
        100,
    );
  });

  it("charges a call that threw (e.g. aborted at 23 s) at the per-call estimate", async () => {
    const inner = new MockLanguageModelV4({
      doGenerate: async () => {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      },
    });
    const meter = meterModel(inner);
    await expect(
      generateText({ model: meter.model, prompt: "a", maxRetries: 0 }),
    ).rejects.toThrow();

    const snap = meter.snapshot();
    expect(snap.started).toBe(1);
    expect(snap.completed).toEqual([]);
    expect(meteredCostCents(PRICE, snap)).toBeCloseTo(estimateCents(PRICE, 1));
  });

  it("costs nothing when no model call was made (e.g. index not ready before the plan call)", () => {
    const meter = meterModel(new MockLanguageModelV4());
    expect(meteredCostCents(PRICE, meter.snapshot())).toBe(0);
  });
});
