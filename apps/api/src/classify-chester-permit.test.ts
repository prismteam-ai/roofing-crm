import { describe, expect, it } from "vitest";
import {
  classifyChesterPermit,
  formatChesterPermitProvenanceLabel,
  isChesterCountyKey,
  isChesterDemoCountyKey,
} from "./classify-chester-permit.js";

describe("classifyChesterPermit", () => {
  it("labels synthetic demo rows by source_system", () => {
    expect(
      classifyChesterPermit({
        improvementType: "Roofing",
        sourceSystem: "chester_synthetic_demo",
        permitId: "SYNTHETIC-CHESTER-1",
      }),
    ).toBe("synthetic_demo");
  });

  it("classifies county GIS well / sewage / Act 247 prefixes", () => {
    expect(
      classifyChesterPermit({
        improvementType: "County health well / drilled",
        sourceSystem: "chester_permits",
        permitId: "W-1",
      }),
    ).toBe("county_gis_well");
    expect(
      classifyChesterPermit({
        improvementType: "County health sewage / septic",
        sourceSystem: "chester_permits",
        permitId: "S-1",
      }),
    ).toBe("county_gis_sewage");
    expect(
      classifyChesterPermit({
        improvementType: "Act 247 Planning review",
        sourceSystem: "chester_permits",
        permitId: "A-1",
      }),
    ).toBe("county_gis_act247");
  });

  it("defaults remaining rows to SmartGov UCC candidates", () => {
    expect(
      classifyChesterPermit({
        improvementType: "Building / Alteration",
        sourceSystem: "chester_permits",
        permitId: "UCC-1",
      }),
    ).toBe("smartgov_ucc");
    expect(formatChesterPermitProvenanceLabel("smartgov_ucc")).toMatch(/UCC/i);
  });

  it("detects Chester county keys", () => {
    expect(isChesterCountyKey("chester")).toBe(true);
    expect(isChesterCountyKey("Chester-Demo")).toBe(true);
    expect(isChesterDemoCountyKey("chester-demo")).toBe(true);
    expect(isChesterDemoCountyKey("chester")).toBe(false);
    expect(isChesterCountyKey("lee")).toBe(false);
  });
});
