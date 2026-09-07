import { describe, expect, it } from "vitest";
import {
  boundingBox,
  bboxSql,
  circlePolygon,
  haversineMiles,
  haversineSql,
} from "@/lib/queries/geo";

const KISSIMMEE = { lat: 28.2919, lng: -81.4076 };
const ST_CLOUD = { lat: 28.2489, lng: -81.2812 };

describe("haversineMiles", () => {
  it("is zero for identical points", () => {
    expect(haversineMiles(KISSIMMEE, KISSIMMEE)).toBe(0);
  });
  it("matches the known Kissimmee - St. Cloud distance (~8.2 mi)", () => {
    const d = haversineMiles(KISSIMMEE, ST_CLOUD);
    expect(d).toBeGreaterThan(8.0);
    expect(d).toBeLessThan(8.5);
  });
  it("is symmetric", () => {
    expect(haversineMiles(KISSIMMEE, ST_CLOUD)).toBeCloseTo(
      haversineMiles(ST_CLOUD, KISSIMMEE),
      10,
    );
  });
});

describe("haversineSql", () => {
  it("interpolates only numbers and uses the documented formula", () => {
    const sql = haversineSql(KISSIMMEE);
    expect(sql).toBe(
      "3958.8*2*asin(sqrt(pow(sin(radians(latitude-(28.2919))/2),2)+cos(radians(28.2919))*cos(radians(latitude))*pow(sin(radians(longitude-(-81.4076))/2),2)))",
    );
  });
  it("rejects non-finite or out-of-range coordinates", () => {
    expect(() => haversineSql({ lat: Number.NaN, lng: 0 })).toThrow(RangeError);
    expect(() => haversineSql({ lat: 0, lng: "1; DROP TABLE" as unknown as number })).toThrow(
      RangeError,
    );
  });
});

describe("boundingBox / bboxSql", () => {
  it("contains the circle", () => {
    const b = boundingBox(KISSIMMEE, 5);
    expect(b.minLat).toBeLessThan(KISSIMMEE.lat - 0.07);
    expect(b.maxLat).toBeGreaterThan(KISSIMMEE.lat + 0.07);
    expect(bboxSql(KISSIMMEE, 5)).toMatch(
      /^latitude BETWEEN -?\d+(\.\d+)? AND -?\d+(\.\d+)? AND longitude BETWEEN -?\d+(\.\d+)? AND -?\d+(\.\d+)?$/,
    );
  });
});

describe("circlePolygon", () => {
  it("returns a closed ring whose points are ~radius away", () => {
    const poly = circlePolygon(KISSIMMEE, 2, 16);
    const ring = poly.geometry.coordinates[0]!;
    expect(ring.length).toBe(17);
    expect(ring[0]).toEqual(ring[16]);
    for (const c of ring) {
      expect(haversineMiles(KISSIMMEE, { lat: c[1] ?? 0, lng: c[0] ?? 0 })).toBeCloseTo(2, 0);
    }
  });
});
