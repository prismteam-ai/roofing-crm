import { describe, expect, it } from "vitest";
import { resolveLeadProvenanceTier, scoreLead } from "./score-lead.js";

describe("scoreLead", () => {
  it("scores aging roofs and long-open permits higher", () => {
    expect(
      scoreLead({
        structureAgeYears: 30,
        maxOpenPermitYears: 8,
        hasSyntheticSignal: false,
      }),
    ).toBeGreaterThan(
      scoreLead({
        structureAgeYears: 16,
        maxOpenPermitYears: 5,
        hasSyntheticSignal: false,
      }),
    );
  });

  it("demotes synthetic signals relative to equal sourced strength", () => {
    const sourced = scoreLead({
      structureAgeYears: 25,
      maxOpenPermitYears: 7,
      hasSyntheticSignal: false,
    });
    const synthetic = scoreLead({
      structureAgeYears: 25,
      maxOpenPermitYears: 7,
      hasSyntheticSignal: true,
    });
    expect(sourced - synthetic).toBe(15);
  });

  it("returns 0 when no qualifying signals exist", () => {
    expect(
      scoreLead({
        structureAgeYears: null,
        maxOpenPermitYears: null,
      }),
    ).toBe(0);
  });
});

describe("resolveLeadProvenanceTier", () => {
  it("taints on synthetic built year or permit provenance", () => {
    expect(resolveLeadProvenanceTier({ builtYearSource: "synthetic_demo" })).toBe(
      "synthetic_demo",
    );
    expect(
      resolveLeadProvenanceTier({
        permitProvenanceClasses: ["smartgov_ucc", "synthetic_demo"],
      }),
    ).toBe("synthetic_demo");
    expect(resolveLeadProvenanceTier({ permitDetailsSource: "synthetic_demo" })).toBe(
      "synthetic_demo",
    );
  });

  it("stays sourced when every input is authoritative", () => {
    expect(
      resolveLeadProvenanceTier({
        builtYearSource: null,
        permitProvenanceClasses: ["smartgov_ucc"],
        permitDetailsSource: "query_permits",
      }),
    ).toBe("sourced");
  });
});
