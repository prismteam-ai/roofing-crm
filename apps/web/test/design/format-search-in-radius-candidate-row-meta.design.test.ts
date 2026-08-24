import { describe, expect, it } from "vitest";

import {
  formatSearchInRadiusCandidateDistanceCopy,
  formatSearchInRadiusCandidateRoofAgeCopy,
  formatSearchInRadiusCandidateStructureLineCopy,
} from "../../src/map/format-search-in-radius-candidate-row-meta";

describe("formatSearchInRadiusCandidateRowMeta", () => {
  it("formats distance without a space before mi", () => {
    expect(formatSearchInRadiusCandidateDistanceCopy(0.7)).toBe("0.7mi");
  });

  it("formats structure line with lowercase structure", () => {
    expect(
      formatSearchInRadiusCandidateStructureLineCopy({
        addressCity: "Fort Myers",
        builtYear: 1988,
      }),
    ).toBe("Fort Myers structure 1988");
  });

  it("shows roof age without aprox for published structure years", () => {
    expect(
      formatSearchInRadiusCandidateRoofAgeCopy({
        builtYear: 1998,
        builtYearSource: null,
        currentUtcYear: 2026,
      }),
    ).toBe("roof 28y/o");
  });

  it("shows roof age with aprox for synthetic demo rows", () => {
    expect(
      formatSearchInRadiusCandidateRoofAgeCopy({
        builtYear: 1998,
        builtYearSource: "synthetic_demo",
        currentUtcYear: 2026,
      }),
    ).toBe("roof 28y/o aprox");
  });

  it("shows roof age unknown when structure year is missing", () => {
    expect(
      formatSearchInRadiusCandidateRoofAgeCopy({
        builtYear: null,
        currentUtcYear: 2026,
      }),
    ).toBe("roof age unknown");
  });
});
