// T026 (B-09, Phase 4/US1), rewritten for the 009-agent-hardening architecture fix: the accepted
// ADR (docs/decisions/0000-agent-architecture.md §§4-6.3) is a two-call, code-driven design, not
// an AI-SDK tool loop. There is no longer one `generateText({tools})` call whose own tool-loop
// steps drive retrieval — `apps/api/src/agent/composeAnswer.ts`'s `runAsk` makes exactly two model
// calls here (a plan call, then a compose call; see the repair-retry test below for the
// three-call path) and calls the real `LeadIndex`-backed dispatch functions
// (`services/agent/tools.ts`'s `createAgentDispatch`) itself, deterministically, from plain
// TypeScript in between — never via a model-driven tool-call step.
//
// `MockLanguageModelV4` (not `MockLanguageModelV2`: that class does not exist in the installed
// `ai@7.0.152`'s `ai/test` subpackage) is given a `doGenerate` sequence of exactly two responses:
// a plan-shaped JSON text (no tool call — `generateOnce` never passes `tools` at all, so the
// model is never offered one), then a compose-shaped JSON text that plants a fake `property_cid`
// citation NOT present in any dispatch result this turn. The server-side citation verifier
// (services/agent/verifyCitations.ts) must strip it before the answer leaves the server, so the
// returned `AgentAnswer.claims` must never carry a `citationIds` entry pointing at that fake
// citation. `trace.modelCalls` must stay within the ADR-06 budget of <=3 model calls (here: 2 —
// plan + compose, no repair needed).
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import { router, createCallerFactory } from "../../src/trpc.js";
import { agentRouter } from "../../src/routers/agent.js";
import { resetUsageGuardForTest, setUsageGuardForTest } from "../../src/agent/usageGuard.js";
import { fakeUsageGuard } from "../support/fakeUsageGuard.js";

// The usage guard fails closed when unconfigured (CR finding 4); these tests exercise the turn
// itself, so they inject a permissive in-memory guard.
beforeEach(() => setUsageGuardForTest(fakeUsageGuard().guard));
afterEach(() => resetUsageGuardForTest());

const REAL_PROPERTY_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
// Planted in the mocked compose output only — never returned by any dispatch call this turn, so
// the server-side citation verifier must strip any claim that cites it (the test's core
// assertion).
const FAKE_PLANTED_PROPERTY_CID =
  "bafkreiFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA";

function property(overrides: Partial<Provenanced<CrmProperty>> = {}): Provenanced<CrmProperty> {
  return {
    propertyCid: REAL_PROPERTY_CID,
    requestIdentifier: "R-0001",
    latitude: 30.4118,
    longitude: -97.7069,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 32,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute",
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: REAL_PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

/** Same shape as search.properties.test.ts's `FakeLeadIndex` (B-03 convention) — never reaches
 *  real DuckDB/S3; the agent's dispatch functions (`services/agent/tools.ts`) call this same
 *  `LeadIndex` port. `searchProperties`/`searchPermits` are spy-wrapped so the out-of-scope test
 *  (agent.outOfScope.test.ts) can assert they were never called; here they're exercised for
 *  real. */
class FakeLeadIndex implements LeadIndex {
  readonly searchPropertiesCalls: SearchPropertiesQuery[] = [];
  constructor(private readonly rows: Provenanced<CrmProperty>[]) {}
  async indexInfo() {
    return {
      manifestCid: "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute",
      propertyCount: this.rows.length,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(query: SearchPropertiesQuery) {
    this.searchPropertiesCalls.push(query);
    return this.rows;
  }
  async searchPermits(_query: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return "travis-202609-permits-20261021t103516z";
  }
  async getProperty(propertyCid: string) {
    const found = this.rows.find((r) => r.propertyCid === propertyCid);
    return found === undefined ? null : { ...found, permits: [] };
  }
  async getPropertyByRequestIdentifier(requestIdentifier: string) {
    return this.rows.find((r) => r.requestIdentifier === requestIdentifier);
  }
}

/** Exactly two `doGenerate` calls: the plan call (a `QueryPlan`-shaped JSON — no tool call, since
 *  `generateOnce` never offers one), then the compose call (claims + citations, one real + one
 *  fake/planted). A third call would be the repair call, not exercised here (see
 *  agent.planRepair.test.ts for that path) — a mock that only has two entries throws on a third
 *  `doGenerate`, which would fail this test loudly if the implementation ever called more than
 *  plan+compose on a valid-plan turn. */
function buildMockModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              intent: "find_properties",
              area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
              filters: { roofAgeMinYears: 15 },
              slotSources: { roofAgeMinYears: "stated" },
              unsupported: [],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      },
      {
        // Compose step: cites one real, server-returned property plus one fake, planted CID that
        // never appeared in any dispatch result this turn.
        content: [
          {
            type: "text",
            text: JSON.stringify({
              claims: [
                { text: "R-0001 has a roof over 15 years old.", citationIds: [1] },
                {
                  text: "A fabricated extra property the model invented.",
                  citationIds: [2],
                },
              ],
              citations: [
                { id: 1, propertyCid: REAL_PROPERTY_CID },
                { id: 2, propertyCid: FAKE_PLANTED_PROPERTY_CID },
              ],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 60, text: 60, reasoning: undefined },
        },
        warnings: [],
      },
    ],
  });
}

function ctx() {
  const leadIndex = new FakeLeadIndex([property()]);
  const model = buildMockModel();
  return {
    leadIndex,
    model,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-1",
      userId: "rep-1",
      leadIndex,
      model,
    }),
  };
}

describe("agent.ask (T026) — plan + compose, code-driven dispatch in between", () => {
  it("stays within the <=3 model-calls budget, dispatches via the real LeadIndex, and never lets a planted fake citation reach claims", async () => {
    const { c, model, leadIndex } = ctx();

    const answer = await c.agent.ask({
      question: "roofing opportunities near Pflugerville",
      threadId: "thread-1",
    });

    expect(answer.trace.modelCalls).toBeLessThanOrEqual(3);
    expect(answer.trace.modelCalls).toBe(2);
    expect(model.doGenerateCalls.length).toBe(2);

    // Deterministic dispatch happened via the real LeadIndex port, not a model tool-call step.
    expect(leadIndex.searchPropertiesCalls.length).toBeGreaterThan(0);

    // Core assertion: the fake, planted `property_cid` must never surface in the returned
    // claims/citations, however the server-side verifier implements the strip.
    const citedPropertyCids = answer.citations
      .map((citation) => citation.propertyCid)
      .filter((cid): cid is string => cid !== undefined);
    expect(citedPropertyCids).not.toContain(FAKE_PLANTED_PROPERTY_CID);

    const fakeCitationIds = answer.citations
      .filter((citation) => citation.propertyCid === FAKE_PLANTED_PROPERTY_CID)
      .map((citation) => citation.id);
    for (const claim of answer.claims) {
      for (const citationId of claim.citationIds) {
        expect(fakeCitationIds).not.toContain(citationId);
      }
    }
  });

  // T046 (B-09, Phase 5/US2, contracts/observability.md agent-metrics table): every real
  // `agent.ask` call emits the full agent metric set in one EMF flush (same `obs` instance
  // threaded from `routers/agent.ts` into `agent/composeAnswer.ts`). Powertools' `Metrics`
  // writes its EMF JSON through its own internal `Console` bound to `process.stdout` (same
  // mechanism `packages/observability/test/powertools.test.ts` already relies on for the
  // Logger), so this spies on `process.stdout.write` rather than the global `console`.
  it("emits AgentAsksTotal/AgentAnswerLatencyMs/AgentModelCallsTotal/citation metrics with the right values and an 'outcome' dimension", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { c } = ctx();
      const answer = await c.agent.ask({
        question: "roofing opportunities near Pflugerville",
        threadId: "thread-2",
      });

      const emfLine = stdoutSpy.mock.calls
        .map((call: unknown[]) => String(call[0]))
        .find((line: string) => line.includes("AgentCitationsTotal"));
      expect(emfLine).toBeDefined();
      const emf = JSON.parse(emfLine as string);

      // CR-B-09 finding 17: the planted citation is one the model produced, so it counts in the
      // total; only the real one verifies — total=2, verified=1, rate=50.
      expect(emf.AgentAsksTotal).toBe(1);
      expect(typeof emf.AgentAnswerLatencyMs).toBe("number");
      expect(emf.AgentAnswerLatencyMs).toBeGreaterThanOrEqual(0);
      expect(emf.AgentModelCallsTotal).toBe(answer.trace.modelCalls);
      expect(emf.AgentCitationsTotal).toBe(2);
      expect(emf.AgentCitationsVerified).toBe(1);
      expect(emf.AgentCitationGroundednessRate).toBe(50);
      expect(emf.AgentLeadsProposed).toBe(0);
      expect(emf.outcome).toBe(answer.outcome);
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

// Finding 8 remainder (CR-B-09): the thread's saved plan is read back for the next turn, so a
// follow-up ("near that area") inherits the area per ADR-06 §6.3 / G2.
describe("agent.ask — follow-up inherits the thread's last plan", () => {
  it("passes the saved plan to the plan step and applies the inherited area", async () => {
    const fake = fakeUsageGuard();
    setUsageGuardForTest(fake.guard);
    const leadIndex = new FakeLeadIndex([property()]);
    const model = new MockLanguageModelV4({
      doGenerate: [
        textResponse({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { roofAgeMinYears: 15 },
          slotSources: { roofAgeMinYears: "stated" },
          unsupported: [],
        }),
        textResponse({ claims: [{ text: "R-0001 qualifies.", citationIds: [1] }], citations: [] }),
        textResponse({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 5 },
          filters: { roofAgeMinYears: 20 },
          slotSources: { area: "inherited", roofAgeMinYears: "stated" },
          unsupported: [],
        }),
        textResponse({ claims: [{ text: "R-0001 qualifies.", citationIds: [1] }], citations: [] }),
      ],
    });
    const c = createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-follow-up",
      userId: "rep-1",
      leadIndex,
      model,
    });

    await c.agent.ask({ question: "roofs over 15 near Pflugerville", threadId: "thread-f" });
    const second = await c.agent.ask({ question: "only older than 20", threadId: "thread-f" });

    expect(fake.lastPlan).toHaveBeenCalledWith("thread-f", "rep-1");
    expect(second.plan.area.query).toBe("Pflugerville");
    expect(second.plan.slotSources.area).toBe("inherited");
    expect(second.plan.filters.roofAgeMinYears).toBe(20);
    expect(second.outcome).toBe("answered");
  });
});

function textResponse(json: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(json) }],
    finishReason: { unified: "stop" as const, raw: "end_turn" },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}
