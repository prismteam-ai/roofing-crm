// Clicking a hexagon of the county overview drops the search pin at its centre and opens the radius
// view there. The radius keeps the rep's own value, but never less than the hexagon's circumradius
// (so the circle covers the clicked cell), rounded up to the radius control's step, and never above
// the 25 mi cap.
import { MAX_RADIUS_MI } from "@crm/domain";
import { describe, expect, it } from "vitest";
import {
  hexCellLabel,
  hexCircumradiusMi,
  hexSearchRadiusMi,
  parseHexZoom,
} from "../../../src/components/Map/hexSearch.js";

const LAT = 30.3;

describe("hexCircumradiusMi", () => {
  it("is the cell's on-screen radius (24 px) at that zoom, in miles", () => {
    // 156543.034 * cos(30.3 deg) / 2^9 * 24 px / 1609.344 m per mile
    expect(hexCircumradiusMi(LAT, 9)).toBeCloseTo(3.92, 1);
    expect(hexCircumradiusMi(LAT, 10)).toBeCloseTo(1.96, 1);
  });

  it("halves with each zoom step", () => {
    expect(hexCircumradiusMi(LAT, 8) / hexCircumradiusMi(LAT, 9)).toBeCloseTo(2, 5);
  });
});

describe("hexSearchRadiusMi", () => {
  it("covers the clicked cell: at least the circumradius, rounded up to the 0.5 step", () => {
    expect(hexSearchRadiusMi(LAT, 9, undefined)).toBe(5); // default 5 already covers 3.92
    expect(hexSearchRadiusMi(LAT, 9, 1)).toBe(4); // user's 1 mi would not: 3.92 rounds up to 4
    expect(hexSearchRadiusMi(LAT, 9, 2.5)).toBe(4);
  });

  it("keeps the user's radius when it already covers the cell", () => {
    expect(hexSearchRadiusMi(LAT, 9, 10)).toBe(10);
    expect(hexSearchRadiusMi(LAT, 10, 3)).toBe(3);
  });

  it("uses the default (5) when none was set", () => {
    expect(hexSearchRadiusMi(LAT, 10, undefined)).toBe(5);
  });

  it("never goes above the radius cap", () => {
    expect(hexSearchRadiusMi(LAT, 6, undefined)).toBe(MAX_RADIUS_MI);
    expect(hexSearchRadiusMi(LAT, 9, 25)).toBe(MAX_RADIUS_MI);
  });
});

describe("parseHexZoom", () => {
  it("reads the zoom out of a cell id", () => {
    expect(parseHexZoom("9:-29:1499")).toBe(9);
    expect(parseHexZoom("10:5:6")).toBe(10);
  });
  it("is null for a malformed id", () => {
    expect(parseHexZoom("nope")).toBeNull();
  });
});

describe("hexCellLabel", () => {
  it("names the cell, its median roof age and its properties, and says it opens a search here", () => {
    expect(hexCellLabel({ medianRoofAge: 21, count: 120 })).toBe(
      "Hexagon, median roof age 21 years, 120 properties, open here",
    );
    expect(hexCellLabel({ medianRoofAge: 15.5, count: 1 })).toBe(
      "Hexagon, median roof age 15.5 years, 1 property, open here",
    );
  });

  it("says so when no roof age is published", () => {
    expect(hexCellLabel({ medianRoofAge: null, count: 4 })).toBe(
      "Hexagon, no roof age published, 4 properties, open here",
    );
  });

  it("formats big counts", () => {
    expect(hexCellLabel({ medianRoofAge: 20, count: 12345 })).toContain("12,345 properties");
  });
});
