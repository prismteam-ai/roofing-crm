import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  AgentAnswer,
  createAgentHandler,
  createRoofingAgent,
  loadOracleTools,
  memoryBudget,
  ORACLE_READ_TOOLS,
} from "../src/index.ts";
import { FTL, P1, P2, startFakeMcp } from "./fake-mcp.ts";

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const call = (id: string, toolName: string, input: object) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
  usage,
  warnings: [],
});
const say = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "end_turn" },
  usage,
  warnings: [],
});

let mcp: Awaited<ReturnType<typeof startFakeMcp>>;
let conn: Awaited<ReturnType<typeof loadOracleTools>>;
beforeAll(async () => {
  mcp = await startFakeMcp();
  conn = await loadOracleTools({ url: mcp.url });
});
afterAll(async () => {
  await conn?.close();
  await mcp?.close();
});

const MAP = { center: { lat: 26.15, lon: -80.3 }, radiusMiles: 5 };
function agentWith(script: any[]) {
  const model = new MockLanguageModelV4({ doGenerate: script });
  return { model, agent: createRoofingAgent({ tools: conn.tools, model, modelId: "mock" }) };
}

describe("MCP tools", () => {
  test("only the read-only Oracle tools are offered (no SQL)", () => {
    expect(Object.keys(conn.tools).sort()).toEqual([...ORACLE_READ_TOOLS].sort());
    expect(conn.tools.run_read_only_sql).toBeUndefined();
  });
});

describe("agent", () => {
  test("'open roofing permits older than five years within five miles of Fort Lauderdale' → resolve_place then find_open_roof_permits{radiusMiles:5,minOpenYears:5}", async () => {
    const { agent } = agentWith([
      call("1", "resolve_place", { name: "Fort Lauderdale" }),
      call("2", "find_open_roof_permits", { ...FTL, radiusMiles: 5, minOpenYears: 5 }),
      say(`2 permits: R-1 at ${P1.address} (parcel ${P1.parcel_identifier}) open 8 years.`),
    ]);
    const a = await agent.ask({
      message: "open roofing permits older than five years within five miles of Fort Lauderdale",
      history: [],
    });
    AgentAnswer.parse(a);
    expect(a.steps.map((s) => s.tool)).toEqual(["resolve_place", "find_open_roof_permits"]);
    expect(a.steps[1].args).toMatchObject({ radiusMiles: 5, minOpenYears: 5 });
    expect(a.steps[1].rowCount).toBe(2);
    expect(a.steps[1].sample).toEqual(["ftl:R-1", "ftl:R-2"]);
    expect(a.results.map((r) => r.propertyId)).toEqual([P1.parcel_identifier, P2.parcel_identifier]);
    expect(a.context).toMatchObject({ center: FTL, radiusMiles: 5, placeName: "FORT LAUDERDALE" });
    expect(a.missingData.join(" ")).toMatch(/No BBB rating/);
    expect(mcp.calls).toContain("find_open_roof_permits");
  });

  test("unknown place → assumption recorded, map center used", async () => {
    const { agent } = agentWith([
      call("1", "resolve_place", { name: "Springfield" }),
      call("2", "find_aged_roofs", { ...MAP.center, radiusMiles: 5, minRoofAgeYears: 15 }),
      say("Springfield is not in Broward County, so I searched around the map center."),
    ]);
    const a = await agent.ask({
      message: "aged roofs within five miles of Springfield",
      history: [],
      mapContext: MAP,
    });
    const all = a.assumptions.join(" ");
    expect(all).toMatch(/"Springfield" is not a Broward County place/);
    expect(all).toMatch(/map center \(26\.1500, -80\.3000\) instead of "Springfield"/);
    expect(a.context.center).toEqual(MAP.center);
  });

  test("unknown place without map context → asks a clarifying question, no search tool", async () => {
    const { agent } = agentWith([
      call("1", "resolve_place", { name: "Springfield" }),
      say(
        "Springfield is not a Broward County place. Which Broward city should I search, or set the map center?",
      ),
    ]);
    const a = await agent.ask({ message: "aged roofs near Springfield", history: [] });
    expect(a.steps.map((s) => s.tool)).toEqual(["resolve_place"]);
    expect(a.results).toEqual([]);
    expect(a.text).toMatch(/\?$/);
  });

  test("citations reference only IDs returned by tools", async () => {
    const { agent } = agentWith([
      call("1", "find_open_roof_permits", { ...FTL, radiusMiles: 5, minOpenYears: 5 }),
      say(`See permit R-1 (parcel ${P1.parcel_identifier}) and parcel 999999999999.`),
    ]);
    const a = await agent.ask({ message: "long-open permits near the center within 5 miles", history: [] });
    const returned = new Set([P1.parcel_identifier, P2.parcel_identifier]);
    expect(a.citations.length).toBeGreaterThan(0);
    for (const c of a.citations) {
      expect(returned.has(c.propertyId!)).toBe(true);
      expect(c.sourceUrl).toMatch(/^https:\/\//);
    }
    expect(a.citations.map((c) => c.permitId)).toEqual(["ftl:R-1"]);
  });

  test("follow-up 'which of those near that area have permits open over 5 years?' reuses the previous center and radius", async () => {
    const { agent } = agentWith([
      call("1", "find_open_roof_permits", { ...FTL, radiusMiles: 3, minOpenYears: 5 }),
      say("Two of them."),
    ]);
    const a = await agent.ask({
      message: "which of those near that area have permits open over 5 years?",
      history: [
        { role: "user", content: "aged roofs within 3 miles of Fort Lauderdale" },
        {
          role: "assistant",
          content: "…",
          context: { center: FTL, radiusMiles: 3, placeName: "FORT LAUDERDALE" },
        },
      ],
    });
    expect(a.assumptions.join(" ")).toMatch(/Reused the previous search area: FORT LAUDERDALE, 3 miles/);
    expect(a.context).toMatchObject({ center: FTL, radiusMiles: 3, placeName: "FORT LAUDERDALE" });
  });

  test("the system prompt carries the previous area and the map context", async () => {
    const { agent, model } = agentWith([say("ok")]);
    await agent.ask({
      message: "near there?",
      history: [{ role: "assistant", content: "…", context: { center: FTL, radiusMiles: 3 } }],
      mapContext: MAP,
    });
    const prompt = JSON.stringify(model.doGenerateCalls[0].prompt);
    expect(prompt).toContain("Previous turn's search area: center 26.14123, -80.14673");
    expect(prompt).toContain("The CRM map is centered at 26.15000, -80.30000");
  });
});

describe("handler", () => {
  test("over budget → friendly limit message, no model call", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [say("never")] });
    const fixed = () => new Date("2026-11-27T12:00:30Z");
    const budget = memoryBudget({ requestsPerIpPerMinute: 1, dailyTokens: 1_000 }, fixed);
    const h = createAgentHandler({
      connect: () => loadOracleTools({ url: mcp.url }),
      model,
      modelId: "mock",
      budget,
    });
    expect((await h({ message: "hi" }, "1.2.3.4")).status).toBe(200);
    const r = await h({ message: "hi again" }, "1.2.3.4");
    expect(r.status).toBe(429);
    expect((r.body as any).error).toMatch(/try again/i);
    expect(model.doGenerateCalls).toHaveLength(1);

    const spent = memoryBudget({ requestsPerIpPerMinute: 100, dailyTokens: 10 }, fixed);
    await spent.record(10);
    const m2 = new MockLanguageModelV4({ doGenerate: [say("never")] });
    const h2 = createAgentHandler({
      connect: () => loadOracleTools({ url: mcp.url }),
      model: m2,
      modelId: "mock",
      budget: spent,
    });
    expect((await h2({ message: "hi" }, "5.6.7.8")).body).toMatchObject({
      error: expect.stringMatching(/budget/),
    });
    expect(m2.doGenerateCalls).toHaveLength(0);
  });

  test("Oracle MCP unreachable → friendly failure, no invented results", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [say("invented")] });
    const h = createAgentHandler({
      connect: () => loadOracleTools({ url: "http://127.0.0.1:9/mcp", timeoutMs: 2_000 }),
      model,
      modelId: "mock",
      budget: memoryBudget(),
    });
    const r = await h({ message: "aged roofs near Fort Lauderdale" }, "1.1.1.1");
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: expect.stringMatching(/unreachable.*no results/i) });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("an empty question is a 400 with a friendly message", async () => {
    const h = createAgentHandler({
      connect: () => loadOracleTools({ url: mcp.url }),
      model: new MockLanguageModelV4({ doGenerate: [] }),
      modelId: "mock",
      budget: memoryBudget(),
    });
    expect((await h({ message: "  " }, "1.1.1.1")).status).toBe(400);
  });
});
