// tasks.md T004; testplans/B-03-test-cases.md B-03-TC-017 (badge boundary, GAP-5: no real permit
// in the live 35-row slice is anywhere near 1826 days, so this threshold is proven here, in
// Vitest, not against the hosted runtime).
import { describe, expect, it } from "vitest";
import { isLongOpen, openDurationLabel, LONG_OPEN_THRESHOLD_DAYS } from "../src/permit.js";

describe("isLongOpen", () => {
  it("the threshold is 5 years of days, rounded down (1826)", () => {
    expect(LONG_OPEN_THRESHOLD_DAYS).toBe(1826);
  });

  it("is false at the threshold (1826 days)", () => {
    expect(isLongOpen(LONG_OPEN_THRESHOLD_DAYS)).toBe(false);
  });

  it("is true just past the threshold (1827 days)", () => {
    expect(isLongOpen(LONG_OPEN_THRESHOLD_DAYS + 1)).toBe(true);
  });

  it("B-03-TC-017: 1800 days -> no badge, 1900 days -> badge", () => {
    expect(isLongOpen(1800)).toBe(false);
    expect(isLongOpen(1900)).toBe(true);
  });

  it("is false for a permit with no open-days value (closed, not_open)", () => {
    expect(isLongOpen(null)).toBe(false);
  });

  it("is false for the real maximum in the live B-02 slice (47 days)", () => {
    expect(isLongOpen(47)).toBe(false);
  });
});

describe("openDurationLabel", () => {
  it("never recomputes openDays; reads it straight through", () => {
    expect(openDurationLabel(28)).toMatch(/28/);
  });

  it("says 'not available' for a null openDays (permit not open, B-03-TC-018)", () => {
    expect(openDurationLabel(null)).toBe("open duration not available");
  });

  it("labels a multi-year open duration in years", () => {
    expect(openDurationLabel(1827)).toMatch(/year/);
  });
});
