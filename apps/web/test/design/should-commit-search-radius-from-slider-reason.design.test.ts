/**
 * Design tests: live radius search must not fire on every slider drag tick.
 */
import { describe, expect, it } from "vitest";

import { shouldCommitSearchRadiusFromSliderReason } from "../../src/map/should-commit-search-radius-from-slider-reason";

describe("shouldCommitSearchRadiusFromSliderReason", () => {
  it("holds search during thumb drag so Lambda is not stacked", () => {
    expect(shouldCommitSearchRadiusFromSliderReason("drag")).toBe(false);
  });

  it("commits search for keyboard, input, and track press", () => {
    expect(shouldCommitSearchRadiusFromSliderReason("keyboard")).toBe(true);
    expect(shouldCommitSearchRadiusFromSliderReason("input-change")).toBe(true);
    expect(shouldCommitSearchRadiusFromSliderReason("track-press")).toBe(true);
  });
});
