// T006 (B-09, Phase 2 Foundational): QueryPlan Zod shape, verbatim per ADR-06 §4
// (docs/decisions/0000-agent-architecture.md) and data-model.md "QueryPlan (existing ADR shape)".
// One QueryPlan shape must serve both search.properties/search.permits and the agent (ADR
// pattern #2, G8 cross-path equality test) — this only checks the shape accepts/rejects exactly
// the bounds and enums the ADR specifies; G8's equality test lands with the agent tools (Phase 4).
import { describe, expect, it } from "vitest";
import { QueryPlan } from "../../src/agent/queryPlan.js";

function basePlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    intent: "find_properties",
    area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
    filters: {},
    slotSources: { radiusMi: "default" },
    unsupported: [],
    ...overrides,
  };
}

describe("QueryPlan", () => {
  it("accepts a minimal valid plan", () => {
    expect(QueryPlan.safeParse(basePlan()).success).toBe(true);
  });

  it("accepts the full 0.5-25 mi radius bound inclusive (FR-001, same bound as search.*)", () => {
    expect(
      QueryPlan.safeParse(basePlan({ area: { kind: "place", query: "x", radiusMi: 0.5 } })).success,
    ).toBe(true);
    expect(
      QueryPlan.safeParse(basePlan({ area: { kind: "place", query: "x", radiusMi: 25 } })).success,
    ).toBe(true);
  });

  it("rejects a radiusMi outside 0.5-25", () => {
    expect(
      QueryPlan.safeParse(basePlan({ area: { kind: "place", query: "x", radiusMi: 0.4 } })).success,
    ).toBe(false);
    expect(
      QueryPlan.safeParse(basePlan({ area: { kind: "place", query: "x", radiusMi: 25.1 } }))
        .success,
    ).toBe(false);
  });

  it("accepts only the three slotSources values (drives the assumption chips)", () => {
    for (const value of ["stated", "default", "inherited"]) {
      expect(QueryPlan.safeParse(basePlan({ slotSources: { radiusMi: value } })).success).toBe(
        true,
      );
    }
    expect(QueryPlan.safeParse(basePlan({ slotSources: { radiusMi: "guessed" } })).success).toBe(
      false,
    );
  });

  it("accepts only the four unsupported[] reasons", () => {
    for (const reason of ["not_in_export", "no_lexicon_carrier", "out_of_scope", "no_free_text"]) {
      expect(
        QueryPlan.safeParse(basePlan({ unsupported: [{ constraint: "x", reason }] })).success,
      ).toBe(true);
    }
    expect(
      QueryPlan.safeParse(basePlan({ unsupported: [{ constraint: "x", reason: "other" }] }))
        .success,
    ).toBe(false);
  });

  it("rejects an unknown intent", () => {
    expect(QueryPlan.safeParse(basePlan({ intent: "delete_everything" })).success).toBe(false);
  });

  it("accepts the optional area.resolved shape when a place was actually resolved", () => {
    const parsed = QueryPlan.safeParse(
      basePlan({
        area: {
          kind: "place",
          query: "Pflugerville",
          radiusMi: 5,
          resolved: {
            name: "Pflugerville",
            lat: 30.4394,
            lon: -97.62,
            source: "travis-places@1.0.0",
            sha256: "abc123",
            match: "exact",
            score: 1,
          },
        },
      }),
    );
    expect(parsed.success).toBe(true);
  });
});
