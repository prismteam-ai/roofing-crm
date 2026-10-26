// The results panel's pure helpers: the row's "2.8 mi NW" and the numbered pager.
import { describe, expect, it } from "vitest";
import {
  RESULTS_PAGE_SIZE,
  directionLabel,
  distanceFromCentre,
  pageNumbers,
  pageSlice,
} from "../../src/routes/Map/resultsView";

describe("distanceFromCentre / directionLabel (C3)", () => {
  const centre = { lat: 30.4, lng: -97.58 };

  it("names the direction the property lies in, from the search centre", () => {
    const north = distanceFromCentre(centre, 30.44, -97.58);
    expect(north?.bearing).toBe("N");
    expect(distanceFromCentre(centre, 30.36, -97.58)?.bearing).toBe("S");
    expect(distanceFromCentre(centre, 30.4, -97.54)?.bearing).toBe("E");
    expect(distanceFromCentre(centre, 30.4, -97.62)?.bearing).toBe("W");
    expect(distanceFromCentre(centre, 30.44, -97.62)?.bearing).toBe("NW");
    expect(distanceFromCentre(centre, 30.44, -97.54)?.bearing).toBe("NE");
    expect(distanceFromCentre(centre, 30.36, -97.54)?.bearing).toBe("SE");
    expect(distanceFromCentre(centre, 30.36, -97.62)?.bearing).toBe("SW");
  });

  it("prints miles with one decimal, the unit and the direction", () => {
    const value = distanceFromCentre(centre, 30.44, -97.58);
    // 0.04 degrees of latitude is about 2.76 miles.
    expect(directionLabel(value as NonNullable<typeof value>)).toBe("2.8 mi N");
    expect(directionLabel({ miles: 0.04, bearing: "SW" })).toBe("0.0 mi SW");
  });

  it("has no distance for a property with no published coordinates", () => {
    expect(distanceFromCentre(centre, null, -97.6)).toBeNull();
    expect(distanceFromCentre(centre, 30.4, null)).toBeNull();
  });
});

describe("pageSlice (C6)", () => {
  it("cuts the loaded rows into pages of ten", () => {
    expect(RESULTS_PAGE_SIZE).toBe(10);
    expect(pageSlice(25, 1)).toEqual({ start: 0, end: 10, pages: 3, page: 1 });
    expect(pageSlice(25, 3)).toEqual({ start: 20, end: 25, pages: 3, page: 3 });
  });

  it("clamps a page that no longer exists after the result shrinks", () => {
    expect(pageSlice(8, 5)).toEqual({ start: 0, end: 8, pages: 1, page: 1 });
    expect(pageSlice(25, 0).page).toBe(1);
  });

  it("an empty result is one empty page", () => {
    expect(pageSlice(0, 1)).toEqual({ start: 0, end: 0, pages: 1, page: 1 });
  });
});

describe("pageNumbers (C6)", () => {
  it("lists every page when there are few", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the first and last page and marks skipped pages with a gap", () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, "gap", 10]);
    expect(pageNumbers(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageNumbers(10, 10)).toEqual([1, "gap", 9, 10]);
  });

  it("does not mark a gap where only one page is skipped over nothing", () => {
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
