/**
 * Design tests: bloom the walk circle only when it first appears, not on slider drags.
 */
import { describe, expect, it } from "vitest";

import { shouldBloomRadiusCircle } from "../../src/map/should-bloom-radius-circle";

describe("shouldBloomRadiusCircle", () => {
  it("blooms when the bloom token advances", () => {
    expect(
      shouldBloomRadiusCircle({
        radiusCircleBloomToken: 1,
        previousBloomToken: 0,
        prefersReducedMotion: false,
      }),
    ).toBe(true);
  });

  it("does not rebloom when only the radius miles change", () => {
    expect(
      shouldBloomRadiusCircle({
        radiusCircleBloomToken: 1,
        previousBloomToken: 1,
        prefersReducedMotion: false,
      }),
    ).toBe(false);
  });
});
