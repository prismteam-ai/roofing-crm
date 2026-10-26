import { describe, expect, it } from "vitest";
import {
  DAYS_PER_YEAR,
  METERS_PER_MILE,
  MAX_PERMIT_ROWS,
  MAX_PROPERTY_ROWS,
  TRAVIS_COUNTY_BBOX,
  isInsideTravisCountyBbox,
  milesToMeters,
  yearsToDays,
} from "../src/index.js";

describe("shared constants", () => {
  it("DAYS_PER_YEAR is 365.25 and yearsToDays rounds up", () => {
    expect(DAYS_PER_YEAR).toBe(365.25);
    expect(yearsToDays(1)).toBe(366);
    expect(yearsToDays(5)).toBe(1827);
    expect(yearsToDays(0)).toBe(0);
    expect(yearsToDays(2.5)).toBe(914);
  });

  it("miles convert through the one METERS_PER_MILE", () => {
    expect(milesToMeters(2)).toBe(2 * METERS_PER_MILE);
  });

  it("page limits are the documented 100 and 500", () => {
    expect(MAX_PROPERTY_ROWS).toBe(100);
    expect(MAX_PERMIT_ROWS).toBe(500);
  });
});

describe("TRAVIS_COUNTY_BBOX", () => {
  it("covers the verified Run 3 extent (lng -98.1780..-97.3718, lat up to 30.62868)", () => {
    expect(isInsideTravisCountyBbox({ lat: 30.6286821, lng: -97.7 })).toBe(true);
    expect(isInsideTravisCountyBbox({ lat: 30.3, lng: -98.1780114 })).toBe(true);
    expect(isInsideTravisCountyBbox({ lat: 30.3, lng: -97.3717734 })).toBe(true);
  });

  it("covers the points the old web box refused (north of 30.52, south of 30.09)", () => {
    expect(isInsideTravisCountyBbox({ lat: 30.58, lng: -97.7 })).toBe(true);
    expect(isInsideTravisCountyBbox({ lat: 30.05, lng: -97.7 })).toBe(true);
  });

  it("refuses Georgetown and points beyond the edges", () => {
    expect(isInsideTravisCountyBbox({ lat: 30.6333, lng: -97.678 })).toBe(false);
    expect(isInsideTravisCountyBbox({ lat: TRAVIS_COUNTY_BBOX.south - 0.01, lng: -97.7 })).toBe(
      false,
    );
  });
});
