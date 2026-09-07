import { describe, expect, it, vi } from "vitest";
import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV2 } from "ai/test";
import { createAgentTools, type AgentToolDeps } from "@/lib/agent/tools";
import type { McpDataSource } from "@/lib/mcp/types";

function fakeMcp(): McpDataSource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getPropertySchema: async () => ({
      county: "osceola",
      view: "properties",
      columnCount: 1,
      columns: [{ name: "roof_age_years", type: "INTEGER", description: "years" }],
    }),
    getPermitSchema: async () => ({
      county: "osceola",
      view: "permits",
      columnCount: 1,
      columns: [{ name: "days_open", type: "INTEGER", description: "days" }],
    }),
    queryProperties: async <Row>(sql: string) => {
      calls.push(sql);
      if (/count\(\*\) AS total/.test(sql)) {
        return {
          county: "osceola",
          rowCount: 1,
          limit: 1,
          rows: [
            {
              total: "2",
              open_permits: "1",
              long_open_permits: "1",
              aged_roofs: "2",
              out_of_state_owners: "0",
            },
          ] as Row[],
        };
      }
      return {
        county: "osceola",
        rowCount: 1,
        limit: 100,
        rows: [
          {
            request_identifier: "P1",
            address_street: "1 MAIN ST",
            address_city: "KISSIMMEE",
            latitude: 28.29,
            longitude: -81.4,
            roof_age_years: "30",
            roof_age_basis: "built_year",
            open_roof_permit_count: 1,
            oldest_open_roof_permit_days: 3000,
            source_urls: "https://src.example/p1",
            distance_miles: 0.5,
          },
        ] as Row[],
      };
    },
    queryPermits: async <Row>(sql: string) => {
      calls.push(sql);
      return {
        county: "osceola",
        rowCount: 1,
        limit: 100,
        rows: [
          {
            permit_number: "99-36",
            parcel_identifier: "P1",
            is_roofing: true,
            is_open: true,
            days_open: 10198,
            contractor_name: null,
            bbb_rating: null,
            source_url: "https://src.example/permit",
            address_street: "4001 NOLTE RD",
            address_city: "ST CLOUD",
          },
        ] as Row[],
      };
    },
    findPropertiesInArea: async () => ({
      count: 1,
      parcels: [
        {
          parcelIdentifier: "P1",
          requestIdentifier: "P1",
          latitude: 28.29,
          longitude: -81.4,
          currentAvmValue: null,
          propertyType: "residential",
        },
      ],
    }),
  };
}

function deps(
  mcp = fakeMcp(),
): AgentToolDeps & { mcp: ReturnType<typeof fakeMcp>; createLeads: ReturnType<typeof vi.fn> } {
  return {
    mcp,
    knowledge: async (q) => [
      {
        id: "roof-age",
        title: "properties view",
        section: "How roof age is derived",
        body: `about ${q}`,
        source: "docs",
      },
    ],
    createLeads: vi.fn(async (ids: string[]) => ({
      created: ids.map((id, i) => ({ id: i + 1, parcelId: id, address: "1 MAIN ST" })),
      existing: [],
      unknown: [],
    })),
  };
}

type Tool = { execute: (input: unknown, opts: unknown) => Promise<unknown> };
const opts = { toolCallId: "t", messages: [] };

describe("agent tools", () => {
  it("geocodePlace resolves known places and reports unknown ones", async () => {
    const tools = createAgentTools(deps());
    expect(await (tools.geocodePlace as Tool).execute({ name: "Kissimmee" }, opts)).toMatchObject({
      found: true,
      lat: 28.2919,
    });
    expect(await (tools.geocodePlace as Tool).execute({ name: "Orlando" }, opts)).toMatchObject({
      found: false,
    });
  });

  it("queryProperties enforces read-only SQL before reaching MCP", async () => {
    const d = deps();
    const tools = createAgentTools(d);
    await expect(
      (tools.queryProperties as Tool).execute({ sql: "DELETE FROM properties", limit: 5 }, opts),
    ).rejects.toThrow(/SELECT/);
    expect(d.mcp.calls).toHaveLength(0);
    const ok = (await (tools.queryProperties as Tool).execute(
      { sql: "SELECT 1", limit: 5 },
      opts,
    )) as { rowCount: number };
    expect(ok.rowCount).toBe(1);
  });

  it("searchOpenRoofPermits returns 'not available' for missing BBB/contractor and cites source_url", async () => {
    const tools = createAgentTools(deps());
    const out = (await (tools.searchOpenRoofPermits as Tool).execute(
      { lat: 28.2919, lng: -81.4076, radiusMiles: 5, minYearsOpen: 5 },
      opts,
    )) as {
      sql: string;
      rows: Array<{
        bbbRating: string;
        contractorName: string;
        yearsOpen: number;
        sourceUrl: string;
      }>;
    };
    expect(out.sql).toContain("days_open >= 1825");
    expect(out.rows[0]).toMatchObject({
      bbbRating: "not available",
      contractorName: "not recorded",
      yearsOpen: 27.9,
      sourceUrl: "https://src.example/permit",
    });
  });

  it("searchRoofingLeads returns totals and mapped rows", async () => {
    const tools = createAgentTools(deps());
    const out = (await (tools.searchRoofingLeads as Tool).execute(
      { lat: 28.2919, lng: -81.4076, radiusMiles: 5, roofAgeMin: 15, limit: 10 },
      opts,
    )) as {
      totals: { total: number };
      rows: Array<{ parcelId: string; signal: string }>;
    };
    expect(out.totals.total).toBe(2);
    expect(out.rows[0]).toMatchObject({ parcelId: "P1", signal: "long_open_permit" });
  });

  it("searchKnowledge and createLead delegate to injected deps", async () => {
    const d = deps();
    const tools = createAgentTools(d);
    const k = (await (tools.searchKnowledge as Tool).execute(
      { query: "roof age", limit: 3 },
      opts,
    )) as { hits: Array<{ id: string }> };
    expect(k.hits[0]?.id).toBe("roof-age");
    const c = (await (tools.createLead as Tool).execute({ parcelIds: ["P1"] }, opts)) as {
      created: Array<{ id: number }>;
    };
    expect(c.created[0]?.id).toBe(1);
    expect(d.createLeads.mock.calls[0]?.[0]).toEqual(["P1"]);
    expect(d.createLeads.mock.calls[0]?.[1]).toBeUndefined();
  });
});

describe("agent loop with MockLanguageModelV2", () => {
  it("executes a tool call then answers", async () => {
    const d = deps();
    let step = 0;
    const model = new MockLanguageModelV2({
      doGenerate: async () => {
        step += 1;
        if (step === 1) {
          return {
            finishReason: "tool-calls",
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "geocodePlace",
                input: JSON.stringify({ name: "Kissimmee" }),
              },
            ],
            warnings: [],
          };
        }
        return {
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          content: [{ type: "text", text: "Kissimmee is at 28.2919, -81.4076." }],
          warnings: [],
        };
      },
    });
    const result = await generateText({
      model,
      tools: createAgentTools(d),
      prompt: "where is Kissimmee?",
      stopWhen: stepCountIs(3),
    });
    expect(result.steps).toHaveLength(2);
    expect(result.toolResults.length + result.steps[0]!.toolResults.length).toBeGreaterThan(0);
    expect(result.steps[0]!.toolResults[0]).toMatchObject({
      toolName: "geocodePlace",
      output: { found: true, name: "Kissimmee" },
    });
    expect(result.text).toContain("28.2919");
  });
});
