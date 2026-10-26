// T008 (B-09, Phase 2 Foundational): AgentAnswer Zod shape, verbatim per ADR-06 §4
// (docs/decisions/0000-agent-architecture.md) and data-model.md "AgentAnswer (existing ADR
// shape)" — used verbatim, not the shorter outcome enum an earlier design sketch proposed. Every
// claim must carry at least one citationId; the server-side verifier that checks each citationId
// resolves against this turn's own tool-call results lives in services/agent/verifyCitations.ts
// (Phase 4) — this test only checks the shape, not that verification step.
import { describe, expect, it } from "vitest";
import { AgentAnswer } from "../../src/agent/answer.js";

const BASE_PLAN = {
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: {},
  slotSources: { radiusMi: "default" },
  unsupported: [],
};

function baseAnswer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outcome: "answered",
    claims: [{ text: "3 properties match.", citationIds: [1] }],
    citations: [],
    plan: BASE_PLAN,
    resultSetId: "rs-1",
    counts: {
      matched: 1,
      shown: 1,
      excludedNoCoordinates: 0,
      excludedNoRoofDate: 0,
      truncated: false,
    },
    missing: [],
    trace: {
      traceId: "t-1",
      modelId: "m-1",
      promptVersion: "v1",
      rankVersion: "v1",
      toolSteps: 1,
      modelCalls: 1,
    },
    ...overrides,
  };
}

describe("AgentAnswer", () => {
  it("accepts a minimal valid answer", () => {
    expect(AgentAnswer.safeParse(baseAnswer()).success).toBe(true);
  });

  it("accepts exactly the nine outcome values", () => {
    for (const outcome of [
      "answered",
      "empty_in_scope",
      "out_of_scope",
      "not_found",
      "needs_clarification",
      "field_not_published",
      "timed_out",
      "rate_limited",
      "paused",
    ]) {
      expect(AgentAnswer.safeParse(baseAnswer({ outcome })).success).toBe(true);
    }
  });

  it("rejects an outcome outside the nine-value enum", () => {
    expect(AgentAnswer.safeParse(baseAnswer({ outcome: "fabricated" })).success).toBe(false);
  });

  it("rejects a claim with an empty citationIds array (every claim must cite something)", () => {
    expect(
      AgentAnswer.safeParse(baseAnswer({ claims: [{ text: "x", citationIds: [] }] })).success,
    ).toBe(false);
  });

  it("rejects a claim missing citationIds entirely", () => {
    expect(AgentAnswer.safeParse(baseAnswer({ claims: [{ text: "x" }] })).success).toBe(false);
  });

  it("accepts the optional proposals array and omits it when absent", () => {
    const parsed = AgentAnswer.safeParse(baseAnswer());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.proposals).toBeUndefined();

    const withProposals = AgentAnswer.safeParse(
      baseAnswer({ proposals: [{ tcadId: "R-0001", alreadyLead: false }] }),
    );
    expect(withProposals.success).toBe(true);
  });

  it("accepts trace without the optional cache fields (pre-T045 shape stays valid)", () => {
    expect(AgentAnswer.safeParse(baseAnswer()).success).toBe(true);
  });

  it("accepts trace with T045's optional cache-metadata fields populated", () => {
    const parsed = AgentAnswer.safeParse(
      baseAnswer({
        trace: {
          traceId: "t-1",
          modelId: "m-1",
          promptVersion: "v1",
          rankVersion: "v1",
          toolSteps: 1,
          modelCalls: 1,
          cacheStrategy: "bedrock:system+last-message",
          cacheReadTokens: 120,
          cacheWriteTokens: 45,
        },
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.trace.cacheStrategy).toBe("bedrock:system+last-message");
      expect(parsed.data.trace.cacheReadTokens).toBe(120);
      expect(parsed.data.trace.cacheWriteTokens).toBe(45);
    }
  });

  it("accepts a full citation with every field populated", () => {
    const parsed = AgentAnswer.safeParse(
      baseAnswer({
        citations: [
          {
            id: 1,
            kind: "property",
            propertyCid: "bafkrei...",
            sourceUrl: null,
            capturedAt: "2026-10-21T10:40:04.525Z",
            tableCid: "bafkrei...",
            manifestCid: "bafkrei...",
            asOf: "2026-10-21T10:35:16Z",
          },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
  });
});
