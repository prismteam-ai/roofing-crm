// T010 (B-09, Phase 2 Foundational): confidence-band function per ADR-06 §5
// (docs/decisions/0000-agent-architecture.md) and data-model.md's correction to the story's
// looser edge-case wording: auto >=0.92 (and margin >=0.05 ahead of the runner-up); clarify
// 0.80-0.92, OR margin <0.05 between the top two candidates even at a high score; refuse
// (outcome `not_found`) below 0.80, regardless of margin.
import { describe, expect, it } from "vitest";
import { classifyPlaceConfidence, PLACE_CONFIDENCE_BANDS } from "../../src/agent/thresholds.js";

describe("classifyPlaceConfidence (ADR-06 §5)", () => {
  it("auto-accepts at the >=0.92 score / >=0.05 margin boundary", () => {
    expect(classifyPlaceConfidence(0.92, 0.05)).toBe("auto");
    expect(classifyPlaceConfidence(1, 1)).toBe("auto");
  });

  it("clarifies for 0.80-0.92, even with a wide margin", () => {
    expect(classifyPlaceConfidence(0.8, 0.5)).toBe("clarify");
    expect(classifyPlaceConfidence(0.85, 0.5)).toBe("clarify");
    expect(classifyPlaceConfidence(0.9199, 0.5)).toBe("clarify");
  });

  it("clarifies when score is >=0.92 but the top-2 margin is <0.05 (two close candidates)", () => {
    expect(classifyPlaceConfidence(0.95, 0.03)).toBe("clarify");
    expect(classifyPlaceConfidence(0.99, 0.0499)).toBe("clarify");
  });

  it("refuses (outcome not_found) below 0.80 regardless of margin", () => {
    expect(classifyPlaceConfidence(0.79, 1)).toBe("refuse");
    expect(classifyPlaceConfidence(0, 0)).toBe("refuse");
  });

  it("exposes the versioned band values this function enforces", () => {
    expect(PLACE_CONFIDENCE_BANDS.autoMinScore).toBe(0.92);
    expect(PLACE_CONFIDENCE_BANDS.autoMinMargin).toBe(0.05);
    expect(PLACE_CONFIDENCE_BANDS.clarifyMinScore).toBe(0.8);
  });
});
