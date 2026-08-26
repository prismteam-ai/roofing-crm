import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { ElephantMcpToolClient } from "@roofing-crm-challenge/elephant-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLambdaAppRouter } from "./create-lambda-app-router.js";
import { createInMemoryLeadRecordRepository } from "./leads-record-repository.js";
import * as createAgentAskDependencies from "./rag/create-agent-ask-dependencies.js";
import * as loadLeeFixtureCorpusModule from "./rag/load-lee-fixture-corpus.js";
import { AGENT_REAL_CHESTER_STRUCTURED_ONLY_COPY } from "./rag/agent-coverage-copy.js";
import { AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY } from "./rag/run-roofing-opportunity-agent.js";
import { resetRagRuntimeCacheForTests } from "./rag/resolve-rag-runtime.js";
import type { SearchInRadiusPropertyRow } from "./routers/search.js";
import type { ApiContext } from "./trpc.js";

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
      queryTableUrl:
        "https://ipfs.filebase.io/ipns/k51qzi5uqu5djd4ohcf3qm87dhlt0e270xw8ejhkyia62edr76uj0u05hrf7m5",
    },
  ],
};

function createMockElephantMcpToolClient(): ElephantMcpToolClient {
  const searchRows: SearchInRadiusPropertyRow[] = [
    {
      propertyId: "lee-prop-mcp-1",
      parcelIdentifier: "parcel-mcp-1",
      latitude: 26.6406,
      longitude: -81.8723,
      builtYear: 1980,
      addressStreet: "200 MCP Palm Ave",
      addressCity: "Fort Myers, FL",
      addressZip: null,
      hasPermits: true,
      permitCount: 1,
      hasBbbContractor: false,
      gisMuni: null,
    },
  ];

  return {
    async callTool(toolName, arguments_) {
      if (toolName === "listPublishedCounties") {
        return { content: [{ type: "text", text: JSON.stringify(leeCatalog) }] };
      }
      if (toolName === "queryProperties") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                searchRows.map((row) => ({
                  property_id: row.propertyId,
                  parcel_identifier: row.parcelIdentifier,
                  latitude: row.latitude,
                  longitude: row.longitude,
                  built_year: row.builtYear,
                  address_street: row.addressStreet,
                  address_city: row.addressCity,
                  address_zip: row.addressZip,
                  has_permits: row.hasPermits,
                  permit_count: row.permitCount,
                  has_bbb_contractor: row.hasBbbContractor,
                })),
              ),
            },
          ],
        };
      }
      if (toolName === "getOracleProperty") {
        const propertyId = String(arguments_.propertyId ?? "");
        const row = searchRows.find((candidate) => candidate.propertyId === propertyId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                propertyId,
                parcelIdentifier: row?.parcelIdentifier ?? propertyId,
                addressStreet: row?.addressStreet ?? null,
                addressCity: row?.addressCity ?? null,
                latitude: row?.latitude ?? null,
                longitude: row?.longitude ?? null,
                builtYear: row?.builtYear ?? null,
                hasPermits: false,
                permitCount: 0,
                permits: [],
                businessReputationProfiles: [],
              }),
            },
          ],
        };
      }
      if (toolName === "getPermitQuerySchema") {
        throw new Error("Lee permit query table is unserved");
      }
      if (toolName === "queryPermits") {
        return { content: [{ type: "text", text: "[]" }] };
      }
      throw new Error(`Unexpected tool in mock: ${toolName}`);
    },
  };
}

describe("createLambdaAppRouter", () => {
  afterEach(() => {
    resetRagRuntimeCacheForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Given a mocked MCP client
  // When search.inRadius runs
  // Then results use MCP rows (not DEMO stand-ins)
  it("wires MCP search without DEMO stand-in streets", async () => {
    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const candidates = await caller.search.inRadius({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });

    expect(candidates.some((row) => row.propertyId === "lee-prop-mcp-1")).toBe(true);
    expect(candidates.every((row) => !row.addressStreet?.includes("DEMO"))).toBe(true);
  });

  // Given a prior search.inRadius hit on this Lambda
  // When properties.get runs in drawer mode with permit flags set
  // Then base fields come from the radius cache and consolidated enrichment may run
  it("properties.get uses the inRadius cache and enriches permit detail when flags are set", async () => {
    const innerClient = createMockElephantMcpToolClient();
    const getOraclePropertyCalls: string[] = [];
    const countingClient: ElephantMcpToolClient = {
      async callTool(toolName, arguments_) {
        if (toolName === "getOracleProperty") {
          getOraclePropertyCalls.push(String(arguments_.propertyId ?? ""));
        }
        return innerClient.callTool(toolName, arguments_);
      },
    };

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: countingClient,
    });
    const caller = appRouter.createCaller(createTestApiContext());

    await caller.search.inRadius({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });
    const property = await caller.properties.get({
      county: "lee",
      propertyId: "lee-prop-mcp-1",
    });

    expect(getOraclePropertyCalls).toEqual(["lee-prop-mcp-1"]);
    expect(property.addressStreet).toBe("200 MCP Palm Ave");
    expect(property.builtYear).toBe(1980);
    expect(property.hasPermits).toBe(true);
    expect(property.permitDetailsSource).toBe("synthetic_demo");
    expect(property.permits[0]?.permitId).toMatch(/^SYNTHETIC-/);
  });

  it("properties.get loads a DuckDB point row when the radius cache misses", async () => {
    const innerClient = createMockElephantMcpToolClient();
    const getOraclePropertyCalls: string[] = [];
    const countingClient: ElephantMcpToolClient = {
      async callTool(toolName, arguments_) {
        if (toolName === "getOracleProperty") {
          getOraclePropertyCalls.push(String(arguments_.propertyId ?? ""));
        }
        return innerClient.callTool(toolName, arguments_);
      },
    };

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: countingClient,
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const property = await caller.properties.get({
      county: "lee",
      propertyId: "lee-prop-mcp-1",
    });

    expect(getOraclePropertyCalls).toEqual(["lee-prop-mcp-1"]);
    expect(property.addressStreet).toBe("200 MCP Palm Ave");
    expect(property.permitDetailsSource).toBe("synthetic_demo");
  });

  // Given search then leads.create on the lambda router
  // When leads.list runs
  // Then the lead persists through the injected repository
  it("search then convert uses the lead repository", async () => {
    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
      nowIso: () => "2026-08-21T23:00:00.000Z",
    });
    const caller = appRouter.createCaller(createTestApiContext());

    await caller.search.inRadius({
      county: "lee",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 5,
    });

    const createdLead = await caller.leads.create({
      propertyId: "lee-prop-mcp-1",
      county: "lee",
    });

    expect(createdLead.addressSnapshot).toContain("MCP Palm Ave");

    const listed = await caller.leads.list({ county: "lee" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.leadId).toBe(createdLead.leadId);
  });

  // Given Oracle listPublishedCounties omits chester and Lambda env serves Chester tables + geo
  // When counties.list and defaultCounty run
  // Then chester / chester-demo are map-ready and default is chester-demo
  it("overlays chester onto counties.list when the query-table map serves it", async () => {
    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const listed = await caller.counties.list();
    const defaultCounty = await caller.counties.defaultCounty();

    expect(listed.some((row) => row.countyKey === "chester")).toBe(true);
    expect(listed.some((row) => row.countyKey === "chester-demo")).toBe(true);
    expect(listed.some((row) => row.countyKey === "montgomery")).toBe(true);
    expect(listed.every((row) => row.countyKey !== "delaware")).toBe(true);
    expect(
      listed.find((row) => row.countyKey === "chester")?.propertyDatasetAvailable,
    ).toBe(true);
    expect(listed.find((row) => row.countyKey === "chester")?.mapSearchReady).toBe(
      true,
    );
    expect(listed.find((row) => row.countyKey === "chester-demo")?.mapSearchReady).toBe(
      true,
    );
    expect(listed.find((row) => row.countyKey === "chester")?.countyName).toBe(
      "Chester (real)",
    );
    expect(listed.find((row) => row.countyKey === "chester-demo")?.countyName).toBe(
      "Chester (demo data)",
    );
    expect(
      listed.find((row) => row.countyKey === "montgomery")?.propertyDatasetAvailable,
    ).toBe(true);
    expect(listed.find((row) => row.countyKey === "montgomery")?.mapSearchReady).toBe(
      true,
    );
    expect(listed.find((row) => row.countyKey === "lee")?.mapSearchReady).toBe(true);
    expect(defaultCounty).toEqual({
      countyKey: "chester-demo",
      coverageMode: "chester_demo_synthetic",
    });
  });

  // Given leads.create without a prior search.inRadius on this Lambda instance
  // When create runs against mocked getOracleProperty
  // Then the lead persists using consolidated property facts
  it("create without prior inRadius uses getOracleProperty snapshot", async () => {
    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
      nowIso: () => "2026-08-21T23:00:00.000Z",
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const createdLead = await caller.leads.create({
      propertyId: "lee-prop-mcp-1",
      county: "lee",
    });

    expect(createdLead.addressSnapshot).toContain("MCP Palm Ave");

    const listed = await caller.leads.list({ county: "lee" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.leadId).toBe(createdLead.leadId);
  });

  // Given nested consolidated JSON from getOracleProperty
  // When properties.get runs
  // Then the drawer receives mapped fields with the request property id
  it("properties.get maps nested getOracleProperty payloads", async () => {
    const nestedPropertyId = "chester-prop-nested-1";
    const nestedClient: ElephantMcpToolClient = {
      async callTool(toolName, _arguments_) {
        if (toolName === "listPublishedCounties") {
          return {
            content: [{ type: "text", text: JSON.stringify(leeCatalog) }],
          };
        }
        if (toolName === "queryProperties") {
          return { content: [{ type: "text", text: "[]" }] };
        }
        if (toolName === "getOracleProperty") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  parcelId: "consolidated-parcel-id",
                  parcel: { parcelIdentifier: "1101" },
                  address: {
                    street: "219 LACEY ST",
                    city: "WEST CHESTER, PA",
                    postalCode: "19380",
                    latitude: "39.96012",
                    longitude: "-75.60501",
                  },
                  property: { builtYear: null },
                  permits: [],
                  bbbProfiles: [],
                }),
              },
            ],
          };
        }
        if (toolName === "getPermitQuerySchema") {
          throw new Error("permits query table not served");
        }
        if (toolName === "queryPermits") {
          return { content: [{ type: "text", text: "[]" }] };
        }
        throw new Error(`Unexpected tool in mock: ${toolName}`);
      },
    };

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: nestedClient,
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const property = await caller.properties.get({
      county: "chester",
      propertyId: nestedPropertyId,
    });

    expect(property.propertyId).toBe(nestedPropertyId);
    expect(property.addressStreet).toBe("219 LACEY ST");
    expect(property.permits).toEqual([]);
  });

  it("agent.ask returns not-indexed when fixture corpus is missing on Lambda", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;
    vi.spyOn(loadLeeFixtureCorpusModule, "loadLeeFixtureCorpus").mockRejectedValue(
      new Error(
        "ENOENT: no such file or directory, open '/fixtures/rag/corpus/lee-property-chunks.jsonl'",
      ),
    );

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const response = await caller.agent.ask({
      county: "lee",
      message: "Which roofs near the pin have aging structures?",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 2,
    });

    expect(response.indexed).toBe(false);
    expect(response.answer).toBe(AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY);
    expect(response.citations).toEqual([]);
  });

  it("agent.ask returns not-indexed on Lambda without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const response = await caller.agent.ask({
      county: "lee",
      message: "Which roofs near the pin have aging structures?",
      center: { lat: 26.6406, lng: -81.8723 },
      radiusMiles: 2,
    });

    expect(response.indexed).toBe(false);
    expect(response.answer).toBe(AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY);
    expect(response.citations).toEqual([]);
  });

  it("agent.ask returns structured-search-only copy for map-ready chester without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    const response = await caller.agent.ask({
      county: "chester",
      message: "Which roofs near the pin have aging structures?",
      center: { lat: 39.9607, lng: -75.6055 },
      radiusMiles: 2,
    });

    expect(response.indexed).toBe(false);
    expect(response.answer).toBe(AGENT_REAL_CHESTER_STRUCTURED_ONLY_COPY);
    expect(response.citations).toEqual([]);
    expect(response.fallback?.type).toBe("structured_search");
  });

  it("rethrows agent.ask failures when OpenSearch is configured", async () => {
    vi.stubEnv("OPENSEARCH_ENDPOINT", "https://os.example.com");
    const dependencySpy = vi
      .spyOn(createAgentAskDependencies, "createRoofingOpportunityAgentDependencies")
      .mockRejectedValue(new Error("Bedrock timeout"));

    const appRouter = createLambdaAppRouter({
      leadRecordRepository: createInMemoryLeadRecordRepository(),
      elephantMcpToolClient: createMockElephantMcpToolClient(),
    });
    const caller = appRouter.createCaller(createTestApiContext());

    await expect(
      caller.agent.ask({
        county: "lee",
        message: "Which roofs near the pin have aging structures?",
        center: { lat: 26.6406, lng: -81.8723 },
        radiusMiles: 2,
      }),
    ).rejects.toThrow("Bedrock timeout");

    dependencySpy.mockRestore();
  });
});
