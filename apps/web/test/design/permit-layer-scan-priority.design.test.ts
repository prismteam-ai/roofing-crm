import { describe, expect, it } from "vitest";

import type { SearchInRadiusCandidate } from "../../src/map/SearchInRadiusCandidateList";
import { PERMIT_LAYER_CANDIDATE_SCAN_LIMIT } from "../../src/map/property-permit-layer-summary";
import { selectPermitLayerScanPropertyIds } from "../../src/map/use-permit-layer-candidate-summaries";

function buildCandidate(
  overrides: Partial<SearchInRadiusCandidate> & { propertyId: string },
): SearchInRadiusCandidate {
  return {
    parcelIdentifier: null,
    latitude: 39.96,
    longitude: -75.6,
    builtYear: 1990,
    addressStreet: null,
    addressCity: null,
    gisMuni: null,
    distanceMiles: 1,
    ...overrides,
  };
}

describe("selectPermitLayerScanPropertyIds", () => {
  // Given a sparse permit parcel ranked beyond the scan budget
  // When the scan slice is selected
  // Then flagged-with-permits parcels are scanned before nearer permitless ones
  it("keeps permit-flagged parcels inside the scan budget even when far", () => {
    const nearerPermitless = Array.from({ length: 30 }, (_, index) =>
      buildCandidate({
        propertyId: `no-permit-${String(index)}`,
        distanceMiles: index * 0.1,
        hasPermits: false,
      }),
    );
    const farWithPermit = buildCandidate({
      propertyId: "1-10-67.24",
      distanceMiles: 4.8,
      hasPermits: true,
    });

    const scanned = selectPermitLayerScanPropertyIds([
      ...nearerPermitless,
      farWithPermit,
    ]);

    expect(scanned).toHaveLength(PERMIT_LAYER_CANDIDATE_SCAN_LIMIT);
    expect(scanned[0]).toBe("1-10-67.24");
  });

  // Given candidates without the published flag (older API responses)
  // When the scan slice is selected
  // Then nearest-first order is preserved unchanged
  it("keeps nearest-first order when the has-permits flag is absent", () => {
    const candidates = ["a", "b", "c"].map((propertyId, index) =>
      buildCandidate({ propertyId, distanceMiles: index }),
    );

    expect(selectPermitLayerScanPropertyIds(candidates)).toEqual(["a", "b", "c"]);
  });
});
