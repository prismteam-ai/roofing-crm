import { describe, expect, it } from "vitest";

import {
  PLAT_ROOF_MARKER_AGE_BANDS,
  PLAT_ROOF_MARKER_AGE_UNKNOWN_BAND,
  resolvePlatRoofMarkerAgeBand,
  resolvePlatRoofMarkerAgeBandMetadata,
} from "./plat-roof-marker-age-band";

const CURRENT_UTC_YEAR = 2026;

describe("resolvePlatRoofMarkerAgeBand", () => {
  it("returns unknown when built year is missing", () => {
    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: null,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-unknown");
  });

  it("maps structure age into the weathered-wood ramp", () => {
    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 2020,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-under-10");

    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 2010,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-10-to-19");

    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 2000,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-20-to-29");

    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 1990,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-30-to-39");

    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 1980,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-40-to-49");

    expect(
      resolvePlatRoofMarkerAgeBand({
        builtYear: 1960,
        currentUtcYear: CURRENT_UTC_YEAR,
      }),
    ).toBe("age-50-plus");
  });
});

describe("resolvePlatRoofMarkerAgeBandMetadata", () => {
  it("returns palette metadata for each band id", () => {
    for (const band of PLAT_ROOF_MARKER_AGE_BANDS) {
      expect(resolvePlatRoofMarkerAgeBandMetadata(band.id)).toEqual(band);
    }

    expect(resolvePlatRoofMarkerAgeBandMetadata("age-unknown")).toEqual(
      PLAT_ROOF_MARKER_AGE_UNKNOWN_BAND,
    );
  });
});
