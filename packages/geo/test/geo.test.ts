import { expect, test } from "vitest";
import { circleRing, haversineMiles, insideBounds } from "../src/index.ts";

test("haversine: one degree of latitude is about 69.09 miles", () => {
  expect(
    haversineMiles({ lat: 34, lon: -118 }, { lat: 35, lon: -118 }),
  ).toBeCloseTo(69.09, 1);
});
test("circle ring: closed, every vertex at the radius", () => {
  const c = { lat: 34.199, lon: -118.487 };
  const ring = circleRing(c, 5, 32);
  expect(ring).toHaveLength(33);
  expect(ring[0]).toEqual(ring[32]);
  for (const [lon, lat] of ring)
    expect(haversineMiles(c, { lat, lon })).toBeCloseTo(5, 6);
});
test("LA County bounds", () => {
  expect(insideBounds({ lat: 34.199, lon: -118.487 })).toBe(true);
  expect(insideBounds({ lat: 40.7, lon: -74 })).toBe(false);
});
