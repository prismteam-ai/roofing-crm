/**
 * Unit tests for long-open roofing permit layer summaries.
 */
import { describe, expect, it } from "vitest";

import type { PropertyPermitDetail } from "../../src/map/PropertyPermitLayerPanel";
import {
  resolveMaxLongOpenRoofingPermitYears,
  selectLongOpenRoofingPropertyPermitDetails,
} from "../../src/map/property-permit-layer-summary";
import { selectSearchInRadiusCandidatesForPermitLayer } from "../../src/map/select-search-in-radius-candidates-for-permit-layer";
import type { SearchInRadiusCandidate } from "../../src/map/SearchInRadiusCandidateList";

const CURRENT_UTC_YEAR = 2026;

function createPermit(
  overrides: Partial<PropertyPermitDetail> = {},
): PropertyPermitDetail {
  return {
    permitId: "BP-default",
    permitType: "Roofing",
    status: "Open",
    issuedDate: "2018-01-01",
    openedDate: "2018-01-01",
    closedDate: null,
    description: "Re-roof",
    contractorName: "Contractor",
    ...overrides,
  };
}

describe("selectLongOpenRoofingPropertyPermitDetails", () => {
  // Given a 3-year open roofing permit and an 8-year open roofing permit
  // When the long-open layer selects at a 5-year threshold
  // Then only the 8-year permit remains
  it("excludes permits below the minimum open years", () => {
    const permits = [
      createPermit({
        permitId: "BP-short",
        openedDate: "2023-01-01",
        issuedDate: "2023-01-01",
      }),
      createPermit({
        permitId: "BP-long",
        openedDate: "2018-01-01",
        issuedDate: "2018-01-01",
      }),
    ];

    const longOpenPermits = selectLongOpenRoofingPropertyPermitDetails({
      permitDetails: permits,
      minOpenPermitYears: 5,
      currentUtcYear: CURRENT_UTC_YEAR,
    });

    expect(longOpenPermits).toHaveLength(1);
    expect(longOpenPermits[0]?.permitId).toBe("BP-long");
  });

  // Given two qualifying permits
  // When max open years are resolved
  // Then the longer permit wins
  it("sorts long-open permits by open duration descending", () => {
    const permits = [
      createPermit({
        permitId: "BP-6",
        openedDate: "2020-01-01",
        issuedDate: "2020-01-01",
      }),
      createPermit({
        permitId: "BP-12",
        openedDate: "2014-01-01",
        issuedDate: "2014-01-01",
      }),
    ];

    expect(
      resolveMaxLongOpenRoofingPermitYears({
        permitDetails: permits,
        minOpenPermitYears: 5,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe(12);
  });
});

describe("selectSearchInRadiusCandidatesForPermitLayer", () => {
  const candidates: SearchInRadiusCandidate[] = [
    {
      propertyId: "lee-prop-short",
      parcelIdentifier: "short",
      latitude: 26.64,
      longitude: -81.87,
      builtYear: 1995,
      addressStreet: "1 Short Permit St",
      addressCity: "Fort Myers",
      gisMuni: null,
      distanceMiles: 0.5,
    },
    {
      propertyId: "lee-prop-long",
      parcelIdentifier: "long",
      latitude: 26.65,
      longitude: -81.86,
      builtYear: 1980,
      addressStreet: "9 Long Permit St",
      addressCity: "Fort Myers",
      gisMuni: null,
      distanceMiles: 0.8,
    },
  ];

  // Given permit summaries for two streets
  // When the permit layer is enabled
  // Then only the long-open street remains and sorts first
  it("filters and sorts candidates by long-open permit duration", () => {
    const filtered = selectSearchInRadiusCandidatesForPermitLayer({
      searchInRadiusCandidates: candidates,
      propertyPermitLayerEnabled: true,
      permitDetailsByPropertyId: {
        "lee-prop-short": [
          createPermit({
            permitId: "BP-short",
            openedDate: "2023-01-01",
            issuedDate: "2023-01-01",
          }),
        ],
        "lee-prop-long": [
          createPermit({
            permitId: "BP-long",
            openedDate: "2014-01-01",
            issuedDate: "2014-01-01",
          }),
        ],
      },
      currentUtcYear: CURRENT_UTC_YEAR,
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.propertyId).toBe("lee-prop-long");
  });
});
