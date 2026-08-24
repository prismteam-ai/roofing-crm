import { describe, expect, it } from "vitest";

import {
  capSearchInRadiusCandidatesForDisplay,
  formatSearchInRadiusCandidateCountCopy,
  SEARCH_IN_RADIUS_NEAREST_CAP_PREFIX,
  SEARCH_IN_RADIUS_NEAREST_CAP_SUFFIX,
} from "./search-in-radius-display-cap";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

function buildCandidate(propertyId: string): SearchInRadiusCandidate {
  return {
    propertyId,
    parcelIdentifier: propertyId,
    latitude: 39.96,
    longitude: -75.6,
    builtYear: null,
    builtYearSource: null,
    addressStreet: null,
    addressCity: null,
    gisMuni: null,
    distanceMiles: 0.5,
  };
}

describe("capSearchInRadiusCandidatesForDisplay", () => {
  // Given 3 ranked candidates and a display cap of 2
  // When the cap is applied
  // Then the top 2 stay in rank order and the third is trimmed
  it("trims ranked candidates past the cap, keeping order", () => {
    const candidates = [
      buildCandidate("top-score"),
      buildCandidate("mid-score"),
      buildCandidate("low-score"),
    ];

    const displayed = capSearchInRadiusCandidatesForDisplay({
      searchInRadiusCandidates: candidates,
      displayCap: 2,
    });

    expect(displayed.map((candidate) => candidate.propertyId)).toEqual([
      "top-score",
      "mid-score",
    ]);
  });

  it("returns the same array when under the cap", () => {
    const candidates = [buildCandidate("only")];

    expect(
      capSearchInRadiusCandidatesForDisplay({
        searchInRadiusCandidates: candidates,
        displayCap: 100,
      }),
    ).toBe(candidates);
  });
});

describe("formatSearchInRadiusCandidateCountCopy", () => {
  // Given the cap hides rows
  // When the header count is formatted
  // Then the copy names the truncation instead of implying completeness
  it("names the truncation when capped", () => {
    expect(
      formatSearchInRadiusCandidateCountCopy({
        displayedCount: 200,
        visibleCount: 850,
        searchRadiusMiles: 2,
      }),
    ).toBe("200 of 850 in 2 mi");
  });

  it("keeps the plain count when nothing is hidden", () => {
    expect(
      formatSearchInRadiusCandidateCountCopy({
        displayedCount: 150,
        visibleCount: 150,
        searchRadiusMiles: 1,
      }),
    ).toBe("150 in 1 mi");
  });
});

describe("search in radius nearest cap copy", () => {
  it("wraps the inline display-cap select", () => {
    expect(SEARCH_IN_RADIUS_NEAREST_CAP_PREFIX).toBe("Search returns the nearest");
    expect(SEARCH_IN_RADIUS_NEAREST_CAP_SUFFIX).toBe("roofs inside the radius.");
  });
});
