/**
 * search.inRadius must survive a live Elephant MCP outage by serving the
 * last-indexed OpenSearch corpus snapshot instead of throwing a 500.
 */
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { ElephantMcpToolClient } from "@roofing-crm-challenge/elephant-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createLambdaAppRouter } from "./create-lambda-app-router.js";
import { createInMemoryLeadRecordRepository } from "./leads-record-repository.js";
import { resetRagRuntimeCacheForTests } from "./rag/resolve-rag-runtime.js";
import type { ApiContext } from "./trpc.js";

const indexedFallbackRow = {
  propertyId: "lee-prop-indexed-1",
  parcelIdentifier: "parcel-indexed-1",
  latitude: 26.6401,
  longitude: -81.8712,
  builtYear: 1978,
  addressStreet: "2017 HEITMAN STREET",
  addressCity: "FORT MYERS",
  addressZip: null,
  hasPermits: false,
  permitCount: null,
  hasBbbContractor: null,
  gisMuni: null,
};

const loadIndexedRowsMock = vi.fn(async () => [indexedFallbackRow]);

vi.mock("./rag/opensearch-retrieval-index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rag/opensearch-retrieval-index.js")>()),
  createOpenSearchClient: vi.fn(() => ({}) as never),
}));

vi.mock("./rag/search-property-rows-from-index.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("./rag/search-property-rows-from-index.js")
  >()),
  createIndexedSearchPropertyRowLoader: vi.fn(() => loadIndexedRowsMock),
}));

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-lambda-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiLambdaTest" }),
  };
}

const leeCatalog = {
  counties: [
    {
      countyKey: "lee",
      countyName: "Lee",
      stateCode: "FL",
      queryTableUrl: "https://ipfs.filebase.io/ipns/lee-query-table",
    },
  ],
};

function createOutageElephantMcpToolClient(): ElephantMcpToolClient {
  return {
    async callTool(toolName) {
      if (toolName === "listPublishedCounties") {
        return {
          content: [{ type: "text", text: JSON.stringify(leeCatalog) }],
        };
      }
      throw new Error(
        "Elephant MCP tool queryProperties failed (retryable): MCP error -32001: Request timed out",
      );
    },
  };
}

describe("createLambdaAppRouter indexed search fallback", () => {
  afterEach(() => {
    resetRagRuntimeCacheForTests();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // Given live MCP queryProperties times out and an OpenSearch endpoint exists
  // When search.inRadius runs
  // Then rows come from the indexed corpus instead of a thrown 500
  it("serves search.inRadius from the indexed corpus when live MCP fails", async () => {
    vi.stubEnv("OPENSEARCH_ENDPOINT", "https://example.es.amazonaws.com");

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createOutageElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const candidates = await caller.search.inRadius({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });

    expect(loadIndexedRowsMock).toHaveBeenCalledTimes(1);
    expect(candidates.map((row) => row.propertyId)).toEqual(["lee-prop-indexed-1"]);
  });

  // Given live MCP fails and no OpenSearch endpoint is configured
  // When search.inRadius runs
  // Then the original MCP error propagates (no silent empty result)
  it("rethrows the live MCP error when no OpenSearch endpoint is configured", async () => {
    vi.stubEnv("OPENSEARCH_ENDPOINT", "");
    delete process.env["OPENSEARCH_ENDPOINT"];

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createOutageElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    await expect(
      caller.search.inRadius({
        county: "lee",
        center: { lat: 26.6406, lng: -81.8723 },
        radiusMiles: 5,
      }),
    ).rejects.toThrow(/queryProperties failed/);
    expect(loadIndexedRowsMock).not.toHaveBeenCalled();
  });
});
