import { describe, expect, it } from "vitest";

import {
  buildMapCandidatesFromAgentCitations,
  mergeSearchInRadiusMapCandidates,
} from "../../src/map/build-map-candidates-from-agent-citations";

describe("buildMapCandidatesFromAgentCitations", () => {
  it("skips citations without coordinates", () => {
    expect(
      buildMapCandidatesFromAgentCitations(
        [
          {
            sourceUri: "elephant://lee/property/lee-prop-202",
            propertyId: "lee-prop-202",
            reason: "Open permit.",
          },
        ],
        { latitude: 26.64, longitude: -81.87 },
      ),
    ).toEqual([]);
  });

  it("builds marker rows from citation coordinates", () => {
    const candidates = buildMapCandidatesFromAgentCitations(
      [
        {
          sourceUri: "elephant://lee/property/lee-prop-202",
          propertyId: "lee-prop-202",
          parcelIdentifier: "p-202",
          reason: "Open permit.",
          latitude: 26.6388,
          longitude: -81.8745,
          addressStreet: "202 Palm Ct",
          addressCity: "Fort Myers",
          builtYear: 2005,
        },
      ],
      { latitude: 26.64, longitude: -81.87 },
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.propertyId).toBe("lee-prop-202");
    expect(candidates[0]?.latitude).toBe(26.6388);
    expect(candidates[0]?.distanceMiles).toBeGreaterThan(0);
  });
});

describe("mergeSearchInRadiusMapCandidates", () => {
  it("appends citation-only markers without duplicating ids", () => {
    const merged = mergeSearchInRadiusMapCandidates(
      [
        {
          propertyId: "lee-prop-101",
          parcelIdentifier: null,
          latitude: 26.64,
          longitude: -81.87,
          builtYear: null,
          addressStreet: null,
          addressCity: null,
          gisMuni: null,
          distanceMiles: 0.2,
        },
      ],
      [
        {
          propertyId: "lee-prop-101",
          parcelIdentifier: null,
          latitude: 26.64,
          longitude: -81.87,
          builtYear: null,
          addressStreet: null,
          addressCity: null,
          gisMuni: null,
          distanceMiles: 0.2,
        },
        {
          propertyId: "lee-prop-202",
          parcelIdentifier: null,
          latitude: 26.6388,
          longitude: -81.8745,
          builtYear: 2005,
          addressStreet: "202 Palm Ct",
          addressCity: "Fort Myers",
          gisMuni: null,
          distanceMiles: 0.4,
        },
      ],
    );

    expect(merged.map((candidate) => candidate.propertyId)).toEqual([
      "lee-prop-101",
      "lee-prop-202",
    ]);
  });
});
