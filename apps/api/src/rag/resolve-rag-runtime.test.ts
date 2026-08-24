import { afterEach, describe, expect, it, vi } from "vitest";

import * as bedrockEmbeddingService from "./bedrock-embedding-service.js";
import {
  resetRagRuntimeCacheForTests,
  resolveRagRuntime,
} from "./resolve-rag-runtime.js";
import { runRoofingOpportunityAgent } from "./run-roofing-opportunity-agent.js";

const LEE_FORT_MYERS_AGENT_ASK_INPUT = {
  county: "lee",
  message: "Which roofs near the pin have aging structures?",
  center: { lat: 26.6406, lng: -81.8723 },
  radiusMiles: 2,
} as const;

describe("resolveRagRuntime", () => {
  afterEach(() => {
    resetRagRuntimeCacheForTests();
    vi.unstubAllEnvs();
  });

  // Given a Lambda runtime without OPENSEARCH_ENDPOINT
  // When resolveRagRuntime runs
  // Then it does not throw and returns an empty in-memory index (not-indexed path)
  it("does not throw on Lambda without OPENSEARCH_ENDPOINT", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    await expect(resolveRagRuntime()).resolves.toBeDefined();
  });

  it("returns empty in-memory index on Lambda without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    const runtime = await resolveRagRuntime();

    expect(await runtime.retrievalIndex.isIndexed()).toBe(false);
    expect(runtime.chunksById.size).toBe(0);
  });

  it("falls back to hash embeddings when Bedrock resolve throws on Lambda without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;
    vi.spyOn(bedrockEmbeddingService, "resolveEmbeddingService").mockImplementation(
      () => {
        throw new Error("Bedrock unavailable");
      },
    );

    const runtime = await resolveRagRuntime();

    expect(await runtime.retrievalIndex.isIndexed()).toBe(false);
    expect(runtime.chunksById.size).toBe(0);
  });

  // Given a Lambda runtime without OPENSEARCH_ENDPOINT
  // When agent.ask runs through the resolved runtime
  // Then the response is not-indexed copy pointing to map filters (not a 500 path)
  it("agent.ask returns not-indexed message without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    const ragRuntime = await resolveRagRuntime();
    const response = await runRoofingOpportunityAgent(
      LEE_FORT_MYERS_AGENT_ASK_INPUT,
      ragRuntime,
    );

    expect(response.indexed).toBe(false);
    expect(response.answer).toMatch(/cannot answer/i);
    expect(response.answer).toMatch(/roofs in this radius/i);
    expect(response.citations).toEqual([]);
    expect(response.confidence).toBe(0);
  });
});
