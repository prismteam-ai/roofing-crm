// tasks.md T004; testplans/B-03-test-cases.md B-03-TC-013 (boundary, GAP-4: no real property in
// the live slice has roofAgeYears of exactly 14 or 15, so the inclusive boundary is proven here).
import { describe, expect, it } from "vitest";
import { isAgedRoof, DEFAULT_ROOF_AGE_YEARS } from "../src/roofAge.js";

describe("isAgedRoof", () => {
  it("B-03-TC-013: age 15 at threshold 15 is included (inclusive boundary)", () => {
    expect(isAgedRoof(15, 15)).toBe(true);
  });

  it("B-03-TC-013: age 14 at threshold 15 is excluded", () => {
    expect(isAgedRoof(14, 15)).toBe(false);
  });

  it("default threshold is 15 years", () => {
    expect(DEFAULT_ROOF_AGE_YEARS).toBe(15);
  });

  it("a null roofAgeYears is never aged (missing data, never shown as 0)", () => {
    expect(isAgedRoof(null, DEFAULT_ROOF_AGE_YEARS)).toBe(false);
  });

  it("ages above the threshold are included", () => {
    expect(isAgedRoof(32, 15)).toBe(true);
    expect(isAgedRoof(48, 25)).toBe(true);
  });
});
