import { describe, expect, it } from "vitest";
import { ROADMAP_SECTIONS, RoadmapSection } from "../../src/schemas/roadmap-section.js";

describe("RoadmapSection enum (T026, data-model.md)", () => {
  it("accepts exactly the five CRM roadmap sections", () => {
    for (const value of ["campaigns", "estimates", "jobs", "invoices", "outreach"]) {
      expect(RoadmapSection.safeParse(value).success).toBe(true);
    }
  });

  it("rejects anything outside the fixed list", () => {
    expect(RoadmapSection.safeParse("leads").success).toBe(false);
  });

  it("ROADMAP_SECTIONS lists exactly the five sections, each a valid enum value", () => {
    expect(ROADMAP_SECTIONS).toHaveLength(5);
    for (const meta of ROADMAP_SECTIONS) {
      expect(RoadmapSection.safeParse(meta.section).success).toBe(true);
    }
  });
});
