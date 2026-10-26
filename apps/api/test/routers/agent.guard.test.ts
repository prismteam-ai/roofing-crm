// B-09 review fixes, router half:
//   finding 3 — rate limit / over budget come back as a typed `AgentAnswer` (`rate_limited` /
//     `paused`, with a retry-after / reset hint) that the Ask screen keys its states on, never a
//     thrown TRPCError; `AgentAsksTotal` is emitted with that outcome, not `error`.
//   finding 4 — no usage guard configured => fail closed (typed error + log), no model call.
//   finding 5 — the reservation is a realistic <=3-call estimate, reconciled after the turn to the
//     metered cost of the calls actually made.
//   finding 6b — proposals returned by `agent.ask` are recorded per thread (with the last plan).
import { Logger } from "@aws-lambda-powertools/logger";
import { MockLanguageModelV4 } from "ai/test";
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import type { LeadRepo } from "../../src/adapters/leadRepo.js";
import { MissingAgentModelIdError } from "../../src/agent/getModel.js";
import { estimateCents } from "../../src/agent/modelPricing.js";
import { RUN_AGENT_MAX_MODEL_CALLS } from "../../src/agent/runAgent.js";
import { resetUsageGuardForTest, setUsageGuardForTest } from "../../src/agent/usageGuard.js";
import { agentRouter } from "../../src/routers/agent.js";
import { createCallerFactory, router } from "../../src/trpc.js";
import { fakeUsageGuard } from "../support/fakeUsageGuard.js";

const MANIFEST = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
const PROPERTY_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function property(): Provenanced<CrmProperty> {
  return {
    propertyCid: PROPERTY_CID,
    requestIdentifier: "0208011301",
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
    sourceManifestCid: MANIFEST,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
  };
}

class FakeLeadIndex implements LeadIndex {
  async indexInfo() {
    return { manifestCid: MANIFEST, propertyCount: 1, permitCount: 0, promotedAt: "2026-10-21" };
  }
  async searchProperties(_q: SearchPropertiesQuery) {
    return [property()];
  }
  async searchPermits(_q: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return "run";
  }
  async getProperty() {
    return null;
  }
  async getPropertyByRequestIdentifier() {
    return property();
  }
}

const noLeadsRepo = { get: async () => null } as unknown as LeadRepo;

function textResult(text: string, input = 1000, output = 200) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "end_turn" },
    usage: {
      inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: output, text: output, reasoning: undefined },
    },
    warnings: [],
  };
}

function planJson(intent: string) {
  return JSON.stringify({
    intent,
    area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
    filters: { roofAgeMinYears: 15 },
    slotSources: {},
    unsupported: [],
  });
}

const COMPOSE = JSON.stringify({
  claims: [{ text: "One property.", citationIds: [1] }],
  citations: [{ id: 1, propertyCid: PROPERTY_CID }],
});

function caller(model: MockLanguageModelV4) {
  return createCallerFactory(router({ agent: agentRouter }))({
    requestId: "req-guard-1",
    userId: "rep-1",
    leadIndex: new FakeLeadIndex(),
    leadRepo: noLeadsRepo,
    model,
  });
}

function emfLines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((line: string) => line.includes("AgentAsksTotal"))
    .map((line: string) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
  resetUsageGuardForTest();
  vi.restoreAllMocks();
});

describe("agent.ask — budget outcomes are typed answers (finding 3)", () => {
  it("returns outcome rate_limited with retryAfterSec, makes no model call, and counts AgentAsksTotal{outcome=rate_limited}", async () => {
    const { guard, reserve } = fakeUsageGuard({ rateLimited: { retryAfterSec: 37 } });
    setUsageGuardForTest(guard);
    const model = new MockLanguageModelV4();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const answer = await caller(model).agent.ask({ question: "near Pflugerville", threadId: "t1" });

    expect(answer.outcome).toBe("rate_limited");
    expect(answer.retryAfterSec).toBe(37);
    expect(answer.claims).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(reserve).not.toHaveBeenCalled();
    const [emf] = emfLines(stdout);
    expect(emf?.outcome).toBe("rate_limited");
    expect(emf?.AgentAsksTotal).toBe(1);
  });

  it("returns outcome paused with resetsAt, makes no model call, and counts AgentAsksTotal{outcome=paused}", async () => {
    const { guard } = fakeUsageGuard({ overBudget: { resetsAt: "2026-10-25T00:00:00.000Z" } });
    setUsageGuardForTest(guard);
    const model = new MockLanguageModelV4();
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const answer = await caller(model).agent.ask({ question: "near Pflugerville", threadId: "t1" });

    expect(answer.outcome).toBe("paused");
    expect(answer.resetsAt).toBe("2026-10-25T00:00:00.000Z");
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(emfLines(stdout)[0]?.outcome).toBe("paused");
  });
});

describe("agent.ask — guard fails closed (finding 4)", () => {
  it("throws a typed AGENT_GUARD_NOT_CONFIGURED error and never calls the model when the usage table isn't wired", async () => {
    vi.stubEnv("CRM_AGENT_USAGE_TABLE_NAME", "");
    resetUsageGuardForTest();
    const model = new MockLanguageModelV4();
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

    const error = await caller(model)
      .agent.ask({ question: "near Pflugerville", threadId: "t1" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    expect(((error as TRPCError).cause as { code?: string } | undefined)?.code).toBe(
      "AGENT_GUARD_NOT_CONFIGURED",
    );
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(logError).toHaveBeenCalledWith(
      "agent usage guard not configured",
      expect.objectContaining({ reason: "UsageGuardNotConfiguredError" }),
    );
    vi.unstubAllEnvs();
  });
});

describe("agent.ask — spend reservation is reconciled to metered cost (finding 5)", () => {
  it("reserves the <=3-call estimate up front, then reconciles to the two calls actually made", async () => {
    const { guard, reserve, reconcile } = fakeUsageGuard();
    setUsageGuardForTest(guard);
    const model = new MockLanguageModelV4({
      doGenerate: [
        textResult(planJson("find_properties"), 1000, 100),
        textResult(COMPOSE, 3000, 300),
      ],
    });

    const answer = await caller(model).agent.ask({ question: "near Pflugerville", threadId: "t1" });
    expect(answer.outcome).toBe("answered");

    const estimate = estimateCents(guard.price, RUN_AGENT_MAX_MODEL_CALLS);
    expect(reserve).toHaveBeenCalledWith("rep-1", estimate);
    expect(reconcile).toHaveBeenCalledTimes(1);
    const [reservation, actual] = reconcile.mock.calls[0] as [{ reservedCents: number }, number];
    expect(reservation.reservedCents).toBe(estimate);
    const p = guard.price;
    expect(actual).toBeCloseTo(
      (((1000 + 3000) * p.inputUsdPerMTok + (100 + 300) * p.outputUsdPerMTok) / 1_000_000) * 100,
    );
    expect(actual).toBeLessThan(estimate);
  });
});

describe("agent.ask — a model that can't be resolved never holds a spend reservation", () => {
  it("leaves the day's spend unchanged (net 0 for the turn) when getModel() throws", async () => {
    const { guard, reserve, reconcile } = fakeUsageGuard();
    setUsageGuardForTest(guard);
    vi.stubEnv("AGENT_MODEL_ID", "");
    try {
      const noModelCaller = createCallerFactory(router({ agent: agentRouter }))({
        requestId: "req-guard-nomodel",
        userId: "rep-1",
        leadIndex: new FakeLeadIndex(),
        leadRepo: noLeadsRepo,
      });

      const error = await noModelCaller.agent
        .ask({ question: "near Pflugerville", threadId: "t1" })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).cause).toBeInstanceOf(MissingAgentModelIdError);
      // The day's spend moves only by what is reserved and then given back on reconcile.
      const reserved = reserve.mock.calls.reduce((sum, [, cents]) => sum + cents, 0);
      const refunded = reconcile.mock.calls.reduce(
        (sum, [reservation, actual]) => sum + (reservation.reservedCents - actual),
        0,
      );
      expect(reserved - refunded).toBe(0);
      expect(reserve).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("agent.ask — proposals are recorded per thread (finding 6b)", () => {
  it("records the turn's plan and proposed tcadIds under threadId + the rep", async () => {
    const { guard, recordTurn } = fakeUsageGuard();
    setUsageGuardForTest(guard);
    const model = new MockLanguageModelV4({
      doGenerate: [textResult(planJson("propose_leads")), textResult(COMPOSE)],
    });

    const answer = await caller(model).agent.ask({
      question: "make leads near Pflugerville",
      threadId: "thread-9",
    });

    expect(answer.proposals?.map((p) => p.tcadId)).toEqual(["0208011301"]);
    expect(recordTurn).toHaveBeenCalledTimes(1);
    const [threadId, actorId, turn] = recordTurn.mock.calls[0] as [
      string,
      string,
      { plan: { intent: string }; proposedTcadIds: readonly string[] },
    ];
    expect(threadId).toBe("thread-9");
    expect(actorId).toBe("rep-1");
    expect(turn.plan.intent).toBe("propose_leads");
    expect(turn.proposedTcadIds).toEqual(["0208011301"]);
  });

  it("drops proposals (and says why) if the thread record can't be written, so the UI never offers an unconfirmable Create", async () => {
    const { guard, recordTurn } = fakeUsageGuard();
    recordTurn.mockRejectedValueOnce(new Error("ddb down"));
    setUsageGuardForTest(guard);
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const model = new MockLanguageModelV4({
      doGenerate: [textResult(planJson("propose_leads")), textResult(COMPOSE)],
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const answer = await caller(model).agent.ask({ question: "leads", threadId: "thread-9" });

    expect(answer.proposals).toBeUndefined();
    expect(answer.missing).toContainEqual(expect.objectContaining({ field: "proposals" }));
  });
});

describe("agent.ask — 23 s timeout path (findings 3 + 5)", () => {
  it("returns timed_out, counts AgentAsksTotal{outcome=timed_out}, and charges the aborted call at the per-call estimate", async () => {
    vi.useFakeTimers();
    try {
      const { guard, reconcile } = fakeUsageGuard();
      setUsageGuardForTest(guard);
      const model = new MockLanguageModelV4({
        doGenerate: ({ abortSignal }) =>
          new Promise((_resolve, reject) => {
            abortSignal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      });
      const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const pending = caller(model).agent.ask({ question: "near Pflugerville", threadId: "t1" });
      await vi.advanceTimersByTimeAsync(23_000);
      const answer = await pending;

      expect(answer.outcome).toBe("timed_out");
      expect(emfLines(stdout)[0]?.outcome).toBe("timed_out");
      const [, actual] = reconcile.mock.calls[0] as [unknown, number];
      expect(actual).toBeCloseTo(estimateCents(guard.price, 1));
    } finally {
      vi.useRealTimers();
    }
  });
});
