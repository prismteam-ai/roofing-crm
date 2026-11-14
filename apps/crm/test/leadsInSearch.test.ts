/** The search key and the parcels.match question the lead list builds (pure functions of leadsInSearch.ts). */
import { describe, expect, test } from "vitest";
import {
  filterOfKey,
  matchInputOf,
  questionOf,
  searchKeyOf,
} from "../src/leadsInSearch.ts";

describe("search key", () => {
  test("without the ownership filter the key is pin, radius and threshold; with it, the basis is appended", () => {
    expect(searchKeyOf(34.199, -118.487, 1, 15)).toBe(
      "34.199000,-118.487000|1|15",
    );
    expect(searchKeyOf(34.199, -118.487, 1, 15, "both")).toBe(
      "34.199000,-118.487000|1|15|both",
    );
  });
  test("filterOfKey gives the search filter, with ownership_basis only when the key carries a known basis", () => {
    const off = filterOfKey("34.199000,-118.487000|2.5|80");
    expect(off).toEqual({
      lat: 34.199,
      lon: -118.487,
      radius_miles: 2.5,
      threshold_years: 80,
    });
    expect("ownership_basis" in off).toBe(false);
    for (const b of ["recording", "base_year", "both"] as const)
      expect(filterOfKey(`34.199000,-118.487000|1|15|${b}`)).toEqual({
        lat: 34.199,
        lon: -118.487,
        radius_miles: 1,
        threshold_years: 15,
        ownership_basis: b,
      });
    expect(
      "ownership_basis" in filterOfKey("34.199000,-118.487000|1|15|owner"),
    ).toBe(false);
  });
});

describe("parcels.match question", () => {
  const KEY = "34.199000,-118.487000|1|15|base_year";
  test("'Leads in this search' alone: the search filter, no long-open fields", () => {
    expect(questionOf(KEY)).toBe(KEY);
    expect(matchInputOf(questionOf(KEY)!)).toEqual(filterOfKey(KEY));
  });
  test("the toggle with 'Leads in this search': the search filter, long_open_permit and the window", () => {
    expect(matchInputOf(questionOf(KEY, "1826|3653")!)).toEqual({
      ...filterOfKey(KEY),
      long_open_permit: true,
      min_open_days: 1826,
      max_open_days: 3653,
    });
  });
  test("the toggle alone: no search filter, long_open_permit and the window (no maximum when unset)", () => {
    expect(questionOf(undefined, "1826|")).toBe("#1826|");
    expect(matchInputOf("#1826|")).toEqual({
      long_open_permit: true,
      min_open_days: 1826,
    });
  });
  test("nothing on: no question", () => {
    expect(questionOf(undefined)).toBeUndefined();
  });
});
