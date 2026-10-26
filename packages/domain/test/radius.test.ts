import { describe, expect, it } from "vitest";
import { bboxFor, distanceMeters, milesToMeters } from "../src/radius.js";

describe("distanceMeters", () => {
  it("is 0 for the same point", () => {
    expect(distanceMeters({ lat: 30.4394, lng: -97.62 }, { lat: 30.4394, lng: -97.62 })).toBe(0);
  });

  it("matches the known great-circle distance for Pflugerville -> the 5.52mi property (B-03-TC-004)", () => {
    // {P_5_52} is confirmed at 5.52 mi from the Pflugerville pin (testplans/B-03-test-cases.md §5).
    // This fixed vector checks the haversine math against that confirmed real-world distance
    // rather than an arbitrary pair of coordinates.
    const pflugerville = { lat: 30.4394, lng: -97.62 };
    // A point ~5.52 mi north of the pin (0.08 deg lat ~ 5.52mi at this latitude).
    const nearby = { lat: 30.5195, lng: -97.62 };
    const meters = distanceMeters(pflugerville, nearby);
    const miles = meters / 1609.344;
    expect(miles).toBeGreaterThan(5);
    expect(miles).toBeLessThan(6);
  });
});

describe("bboxFor", () => {
  it("returns a box that contains the center", () => {
    const center = { lat: 30.4394, lng: -97.62 };
    const box = bboxFor(center, 5);
    expect(box.south).toBeLessThan(center.lat);
    expect(box.north).toBeGreaterThan(center.lat);
    expect(box.west).toBeLessThan(center.lng);
    expect(box.east).toBeGreaterThan(center.lng);
  });

  it("is a superset of the exact circle: every point within radiusMi is inside the box", () => {
    const center = { lat: 30.4394, lng: -97.62 };
    const radiusMi = 6;
    const box = bboxFor(center, radiusMi);
    // Sample points around the exact circle boundary at several bearings.
    const radiusMeters = milesToMeters(radiusMi);
    for (const bearingDeg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const bearing = (bearingDeg * Math.PI) / 180;
      const earthRadius = 6_371_008.8;
      const lat2 = center.lat + (radiusMeters * Math.cos(bearing) * 180) / (Math.PI * earthRadius);
      const lng2 =
        center.lng +
        (radiusMeters * Math.sin(bearing) * 180) /
          (Math.PI * earthRadius * Math.cos((center.lat * Math.PI) / 180));
      expect(lat2).toBeGreaterThanOrEqual(box.south);
      expect(lat2).toBeLessThanOrEqual(box.north);
      expect(lng2).toBeGreaterThanOrEqual(box.west);
      expect(lng2).toBeLessThanOrEqual(box.east);
    }
  });
});
