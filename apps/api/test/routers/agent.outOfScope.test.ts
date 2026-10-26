// T027 (B-09, Phase 4/US1), rewritten for the 009-agent-hardening architecture fix: the scope
// gate (docs/decisions/0000-agent-architecture.md §5) is now **code-enforced**, not a
// system-prompt instruction the model could ignore. `apps/api/src/agent/composeAnswer.ts`'s
// `checkScope` runs in plain TypeScript right after the plan call is Zod-validated, and
// `runAsk`'s own control flow never calls `dispatchPlan` or the compose model on any branch
// other than `"in_scope"` — there is no code path from an out-of-scope `ZIP` to a dispatch/tool
// call, structurally, not just by convention.
//
// This test proves that two ways: (1) the mocked model's `doGenerate` was called exactly once
// (just the plan call — a second call would be the old tool-loop/compose-call shape this
// architecture no longer has), and (2) the fake `LeadIndex`'s `searchProperties`/`searchPermits`
// are spied and asserted never invoked — the actual code-level proof the scope gate works, which
// the old single-`generateText`-call test couldn't assert (tools were always available to that
// one call, so "no tool call happened" was the model's choice, not a structural guarantee).
import { describe, expect, it, afterEach, beforeEach } from "vitest";
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

class EmptyLeadIndex implements LeadIndex {
  searchPropertiesCalls = 0;
  searchPermitsCalls = 0;
  async indexInfo() {
    return {
      manifestCid: "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute",
      propertyCount: 0,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(_query: SearchPropertiesQuery): Promise<Provenanced<CrmProperty>[]> {
    this.searchPropertiesCalls += 1;
    return [];
  }
  async searchPermits(_query: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    this.searchPermitsCalls += 1;
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return undefined;
  }
  async getProperty() {
    return null;
  }
  async getPropertyByRequestIdentifier() {
    return undefined;
  }
}

/** A single plan-step response is expected (contracts/agent-api.md step 3 runs before the scope
 *  check in step 4) — it must never be followed by a second (compose) call, since the scope gate
 *  blocks before `dispatchPlan` and before the compose call are ever reached. Any second
 *  `doGenerate` call throws, so a stray compose call fails the test loudly instead of silently
 *  passing. */
function buildNoSecondCallModel(): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error("agent.ask made a second model call for an out-of-scope ZIP");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              intent: "find_properties",
              area: { kind: "zip", query: "99999", radiusMi: 5 },
              filters: {},
              slotSources: {},
              unsupported: [],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 40, noCache: 40, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 15, text: 15, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

function ctx() {
  const leadIndex = new EmptyLeadIndex();
  const model = buildNoSecondCallModel();
  return {
    leadIndex,
    model,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-oos-1",
      userId: "rep-1",
      leadIndex,
      model,
    }),
  };
}

describe("agent.ask (T027) — out-of-scope ZIP 99999, code-enforced scope gate", () => {
  it("returns outcome out_of_scope with zero results/claims, exactly one model call, and zero LeadIndex search calls", async () => {
    const { c, model, leadIndex } = ctx();

    const answer = await c.agent.ask({
      question: "roofing leads in 99999",
      threadId: "thread-oos-1",
    });

    expect(answer.outcome).toBe("out_of_scope");
    expect(answer.claims).toEqual([]);
    // "results" isn't itself a field name on AgentAnswer (the full Zod shape has no `results[]` —
    // see packages/shared/src/agent/answer.ts); the closest equivalents the contract calls out as
    // "zero results" are `counts.matched`/`counts.shown` and `citations[]`, both required to be
    // empty/zero for an out-of-scope outcome.
    expect(answer.citations).toEqual([]);
    expect(answer.counts.matched).toBe(0);
    expect(answer.counts.shown).toBe(0);

    // The plan-step call is the only model call — the scope gate blocks before any dispatch or
    // compose call (the mock model above throws if `doGenerate` is invoked more than once, so
    // reaching this line already proves it structurally, not just by this count).
    expect(model.doGenerateCalls.length).toBe(1);
    expect(answer.trace.modelCalls).toBe(1);

    // The actual code-level proof the scope gate works: dispatch never reached the LeadIndex at
    // all, on either query path.
    expect(leadIndex.searchPropertiesCalls).toBe(0);
    expect(leadIndex.searchPermitsCalls).toBe(0);
  });
});
