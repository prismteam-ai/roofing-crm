import { describe, expect, it } from "vitest";

import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import { rankSearchInRadiusCandidatesByLeadScore } from "./rank-search-in-radius-candidates-by-lead-score";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

const CURRENT_UTC_YEAR = 2026;

function buildCandidate(
  overrides: Partial<SearchInRadiusCandidate> = {},
): SearchInRadiusCandidate {
  return {
    propertyId: "prop-1",
    parcelIdentifier: "parcel-1",
    latitude: 39.96,
    longitude: -75.6,
    builtYear: null,
    builtYearSource: null,
    addressStreet: "1 Main St",
    addressCity: "West Chester",
    gisMuni: null,
    distanceMiles: 1,
    ...overrides,
  };
}

function buildRoofingPermitDetail(
  overrides: Partial<PropertyPermitDetail> = {},
): PropertyPermitDetail {
  return {
    permitId: "BP-1",
    permitType: "Roofing",
    status: "open",
    issuedDate: "2018-04-01",
    openedDate: null,
    closedDate: null,
    description: "Re-roof",
    contractorName: null,
    sourceSystem: null,
    provenanceClass: null,
    ...overrides,
  };
}

describe("rankSearchInRadiusCandidatesByLeadScore", () => {
  // Given a nearer new build and a farther aging roof with a long-open permit
  // When candidates are ranked
  // Then the aging roof outranks the nearer but unqualified candidate
  it("ranks a strong aging-roof + permit signal above a nearer new build", () => {
    const agingRoofCandidate = buildCandidate({
      propertyId: "prop-aging",
      builtYear: 1990,
      distanceMiles: 4,
    });
    const newBuildCandidate = buildCandidate({
      propertyId: "prop-new",
      builtYear: 2024,
      distanceMiles: 0.5,
    });

    const ranked = rankSearchInRadiusCandidatesByLeadScore({
      searchInRadiusCandidates: [newBuildCandidate, agingRoofCandidate],
      permitDetailsByPropertyId: {
        "prop-aging": [buildRoofingPermitDetail()],
      },
      minStructureAgeYears: 15,
      minOpenPermitYears: 5,
      currentUtcYear: CURRENT_UTC_YEAR,
    });

    expect(ranked.map((candidate) => candidate.propertyId)).toEqual([
      "prop-aging",
      "prop-new",
    ]);
  });

  // Given two equally aged roofs where one carries a synthetic built year
  // When candidates are ranked
  // Then the sourced signal outranks the synthetic one
  it("demotes synthetic-demo signals below equal sourced signals", () => {
    const sourcedCandidate = buildCandidate({
      propertyId: "prop-sourced",
      builtYear: 1995,
      distanceMiles: 3,
    });
    const syntheticCandidate = buildCandidate({
      propertyId: "prop-synthetic",
      builtYear: 1995,
      builtYearSource: "synthetic_demo",
      distanceMiles: 1,
    });

    const ranked = rankSearchInRadiusCandidatesByLeadScore({
      searchInRadiusCandidates: [syntheticCandidate, sourcedCandidate],
      permitDetailsByPropertyId: {},
      minStructureAgeYears: 15,
      minOpenPermitYears: 5,
      currentUtcYear: CURRENT_UTC_YEAR,
    });

    expect(ranked.map((candidate) => candidate.propertyId)).toEqual([
      "prop-sourced",
      "prop-synthetic",
    ]);
  });

  // Given candidates with no qualifying signals (all scores zero)
  // When candidates are ranked
  // Then nearest-first order is preserved
  it("keeps nearest-first order when every score is zero", () => {
    const farCandidate = buildCandidate({
      propertyId: "prop-far",
      distanceMiles: 4,
    });
    const nearCandidate = buildCandidate({
      propertyId: "prop-near",
      distanceMiles: 0.2,
    });

    const ranked = rankSearchInRadiusCandidatesByLeadScore({
      searchInRadiusCandidates: [farCandidate, nearCandidate],
      permitDetailsByPropertyId: {},
      minStructureAgeYears: 15,
      minOpenPermitYears: 5,
      currentUtcYear: CURRENT_UTC_YEAR,
    });

    expect(ranked.map((candidate) => candidate.propertyId)).toEqual([
      "prop-near",
      "prop-far",
    ]);
  });
});
