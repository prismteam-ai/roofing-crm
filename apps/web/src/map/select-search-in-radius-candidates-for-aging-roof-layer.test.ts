import { describe, expect, it } from "vitest";

import { selectSearchInRadiusCandidatesForAgingRoofLayer } from "./select-search-in-radius-candidates-for-aging-roof-layer";

describe("selectSearchInRadiusCandidatesForAgingRoofLayer", () => {
  const candidates = [
    {
      propertyId: "old",
      parcelIdentifier: "a",
      latitude: 1,
      longitude: 1,
      builtYear: 1980,
      addressStreet: "1 St",
      addressCity: "City",
      gisMuni: null,
      distanceMiles: 0.1,
    },
    {
      propertyId: "unknown",
      parcelIdentifier: "b",
      latitude: 1.1,
      longitude: 1.1,
      builtYear: null,
      addressStreet: "2 St",
      addressCity: "City",
      gisMuni: null,
      distanceMiles: 0.2,
    },
  ];

  it("keeps all rows when structure years are unavailable on the table", () => {
    const filtered = selectSearchInRadiusCandidatesForAgingRoofLayer({
      searchInRadiusCandidates: candidates,
      agingRoofLayerEnabled: true,
      minStructureAgeYears: 15,
      currentUtcYear: 2026,
      structureYearUnavailableOnTable: true,
    });

    expect(filtered).toHaveLength(2);
  });

  it("hides null builtYear when some years exist on the table", () => {
    const filtered = selectSearchInRadiusCandidatesForAgingRoofLayer({
      searchInRadiusCandidates: candidates,
      agingRoofLayerEnabled: true,
      minStructureAgeYears: 15,
      currentUtcYear: 2026,
      structureYearUnavailableOnTable: false,
    });

    expect(filtered.map((row) => row.propertyId)).toEqual(["old"]);
  });
});
