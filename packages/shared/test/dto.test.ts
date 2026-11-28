import { describe, expect, test } from "vitest";
import { DEFAULT_ROOF_AGE_YEARS, LeadCandidate, RADIUS_BOUNDS, SearchInput } from "../src/index.ts";

const minimal = { center: { lat: 26.12, lon: -80.14 } };

describe("SearchInput", () => {
  test("defaults roof age to 15, radius to 5 miles and both layers", () => {
    expect(SearchInput.parse(minimal)).toMatchObject({
      minRoofAgeYears: DEFAULT_ROOF_AGE_YEARS,
      radiusMiles: 5,
      minOpenYears: 0,
      layers: ["aged_roofs", "open_permits"],
    });
    expect(DEFAULT_ROOF_AGE_YEARS).toBe(15);
  });

  test("rejects a radius outside 0.25–25 miles", () => {
    expect(SearchInput.safeParse({ ...minimal, radiusMiles: RADIUS_BOUNDS.max + 5 }).success).toBe(false);
    expect(SearchInput.safeParse({ ...minimal, radiusMiles: 0.1 }).success).toBe(false);
    expect(SearchInput.safeParse({ ...minimal, radiusMiles: 0.25 }).success).toBe(true);
  });

  test("rejects an unknown layer or permit status", () => {
    expect(SearchInput.safeParse({ ...minimal, layers: ["pools"] }).success).toBe(false);
    expect(SearchInput.safeParse({ ...minimal, permitStatus: ["stalled"] }).success).toBe(false);
  });
});

test("LeadCandidate allows a property the published archive lacks (no property CID)", () => {
  const c = {
    propertyId: "504203010010",
    propertyCid: null,
    address: "1 Main St",
    city: "Fort Lauderdale",
    lat: 26.12,
    lon: -80.14,
    roofAgeYears: 22,
    roofAgeBasis: "year_built",
    openRoofPermits: [],
    score: 54,
    reasons: ["Roof 22 years old (threshold 15)"],
  };
  expect(LeadCandidate.parse(c).propertyCid).toBeNull();
});
