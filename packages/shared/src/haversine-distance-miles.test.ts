import { describe, expect, it } from "vitest";
import { haversineDistanceMiles } from "./haversine-distance-miles.js";

describe("haversineDistanceMiles", () => {
  // Given two nearby Fort Myers points about a mile apart north-south
  // When Haversine runs
  // Then the distance is about one statute mile
  it("measures roughly one mile of latitude near Fort Myers", () => {
    const miles = haversineDistanceMiles(26.6406, -81.8723, 26.6551, -81.8723);
    expect(miles).toBeGreaterThan(0.9);
    expect(miles).toBeLessThan(1.2);
  });
});
