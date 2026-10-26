// T012: write first, confirm it fails (no bounds helper exists yet). Asserts minZoom is derived
// from cameraForBounds on the Travis County bbox (the shared @crm/domain TRAVIS_COUNTY_BBOX) and that no
// maxBounds is set (research.md, agent-design.md §3).
import { TRAVIS_COUNTY_BBOX } from "@crm/domain";
import { describe, expect, it } from "vitest";
import {
  TRAVIS_COUNTY_BOUNDS,
  buildMapInitOptions,
  computeMinZoom,
  isInTravisCounty,
  type CameraForBoundsMap,
} from "../../../src/components/Map/bounds.js";

describe("CrmMap bounds helper (T012)", () => {
  it("computeMinZoom calls cameraForBounds with the Travis County bbox and returns its zoom", () => {
    const calls: unknown[] = [];
    const fakeMap: CameraForBoundsMap = {
      cameraForBounds: (bounds) => {
        calls.push(bounds);
        return { zoom: 9.4 };
      },
    };
    expect(computeMinZoom(fakeMap)).toBe(9.4);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(TRAVIS_COUNTY_BOUNDS);
  });

  it("the map bounds are the one shared domain bbox (the API agent uses the same one)", () => {
    expect(TRAVIS_COUNTY_BOUNDS).toEqual([
      [TRAVIS_COUNTY_BBOX.west, TRAVIS_COUNTY_BBOX.south],
      [TRAVIS_COUNTY_BBOX.east, TRAVIS_COUNTY_BBOX.north],
    ]);
  });

  it("returns undefined rather than guessing when cameraForBounds can't compute one", () => {
    const fakeMap: CameraForBoundsMap = { cameraForBounds: () => null };
    expect(computeMinZoom(fakeMap)).toBeUndefined();
  });

  it("buildMapInitOptions sets no maxBounds (AC-2: no artificial pan/zoom limit)", () => {
    const options = buildMapInitOptions();
    expect(options).not.toHaveProperty("maxBounds");
    expect(options.center).toEqual([-97.7431, 30.2672]);
  });

  // T017/story edge case 2: isInTravisCounty backs the outside-county state for both GPS and
  // pin-drop (testplans/B-03-test-cases.md TC-007/TC-008).
  describe("isInTravisCounty (B-03 edge case 2)", () => {
    it("the Pflugerville AC-1 pin (30.4394, -97.6200) is inside", () => {
      expect(isInTravisCounty({ lat: 30.4394, lng: -97.62 })).toBe(true);
    });

    it("Georgetown, Williamson County (30.6333, -97.6780) is outside", () => {
      expect(isInTravisCounty({ lat: 30.6333, lng: -97.678 })).toBe(false);
    });

    it("accepts Run 3 properties the old box refused (north of 30.52, south of 30.09, west of -98.17)", () => {
      expect(isInTravisCounty({ lat: 30.58, lng: -97.7 })).toBe(true);
      expect(isInTravisCounty({ lat: 30.05, lng: -97.8 })).toBe(true);
      expect(isInTravisCounty({ lat: 30.3, lng: -98.178 })).toBe(true);
    });

    it("is inclusive at the box's own edges", () => {
      const [[west, south], [east, north]] = TRAVIS_COUNTY_BOUNDS;
      expect(isInTravisCounty({ lat: south, lng: west })).toBe(true);
      expect(isInTravisCounty({ lat: north, lng: east })).toBe(true);
    });
  });
});
