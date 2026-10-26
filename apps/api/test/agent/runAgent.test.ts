// CR findings 5 + 7: `generateOnce` returns the call's token usage (input/output + cache
// read/write), passes the turn's abort signal to the SDK, bounds output tokens (so the spend
// reservation is a real ceiling), and never retries a model call on its own — the only extra call
// a turn may make is composeAnswer.ts's one plan-repair call.
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_TOKENS_PER_CALL } from "../../src/agent/modelPricing.js";
import { AGENT_TURN_LIMIT_MS } from "@crm/shared";
import { generateOnce, RUN_AGENT_TIMEOUT_MS } from "../../src/agent/runAgent.js";

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "end_turn" },
    usage: {
      inputTokens: { total: 1350, noCache: 1000, cacheRead: 300, cacheWrite: 50 },
      outputTokens: { total: 200, text: 200, reasoning: undefined },
    },
    warnings: [],
  };
}

describe("generateOnce", () => {
  it("returns input/output/cache token usage for the call", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [ok("hi")] });
    const result = await generateOnce(
      { model, system: "s", prompt: "p" },
      new AbortController().signal,
    );
    expect(result.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 300,
      cacheWriteTokens: 50,
    });
  });

  it("passes the abort signal and the output-token ceiling to the provider call", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [ok("hi")] });
    const controller = new AbortController();
    await generateOnce({ model, system: "s", prompt: "p" }, controller.signal);
    const call = model.doGenerateCalls[0];
    expect(call?.abortSignal).toBe(controller.signal);
    expect(call?.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS_PER_CALL);
  });

  it("does not retry a retryable provider error (no SDK-level retries)", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls += 1;
        throw new APICallError({
          message: "throttled",
          url: "https://bedrock",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        });
      },
    });
    await expect(
      generateOnce({ model, system: "s", prompt: "p" }, new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("RUN_AGENT_TIMEOUT_MS", () => {
  it("is @crm/shared's AGENT_TURN_LIMIT_MS, the one limit the Ask screen's copy also reads", () => {
    expect(RUN_AGENT_TIMEOUT_MS).toBe(AGENT_TURN_LIMIT_MS);
  });
});
