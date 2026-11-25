import { describe, expect, it } from 'vitest';
import { boundingBox, haversineMiles, inBBox, scoreLead, searchInputSchema } from './index.js';

const downtown = { lat: 32.7157, lon: -117.1611 };
const laJolla = { lat: 32.8328, lon: -117.2713 };

describe('geo', () => {
  it('measures downtown San Diego to La Jolla at about 10.4 miles', () => {
    expect(haversineMiles(downtown, laJolla)).toBeGreaterThan(10);
    expect(haversineMiles(downtown, laJolla)).toBeLessThan(11);
  });

  it('builds a bounding box that contains every point inside the radius', () => {
    const box = boundingBox(downtown, 5);
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const p = {
        lat: downtown.lat + (4.99 / 69) * Math.cos(rad),
        lon:
          downtown.lon + (4.99 / (69 * Math.cos((downtown.lat * Math.PI) / 180))) * Math.sin(rad),
      };
      expect(inBBox(p, box)).toBe(true);
    }
    expect(inBBox(laJolla, box)).toBe(false);
  });
});

describe('search input gate', () => {
  it('applies the 15-year default and rejects an oversized radius', () => {
    expect(searchInputSchema.parse({ center: downtown }).minRoofAgeYears).toBe(15);
    expect(() => searchInputSchema.parse({ center: downtown, radiusMiles: 500 })).toThrow();
    expect(() => searchInputSchema.parse({ center: { lat: 200, lon: 0 } })).toThrow();
  });
});

describe('scoreLead', () => {
  it('ranks a long-open roofing permit above an aged roof alone', () => {
    const stalled = scoreLead({
      roofAgeYears: 8,
      roofBasisIsPermit: false,
      openRoofPermits: 1,
      longestOpenDays: 365 * 6,
      ownerOccupied: null,
    });
    const aged = scoreLead({
      roofAgeYears: 30,
      roofBasisIsPermit: false,
      openRoofPermits: 0,
      longestOpenDays: null,
      ownerOccupied: null,
    });
    expect(stalled.score).toBeGreaterThan(aged.score);
    expect(aged.score).toBeGreaterThan(0);
  });

  it('gives zero with no signal and explains every point otherwise', () => {
    const none = scoreLead({
      roofAgeYears: 3,
      roofBasisIsPermit: false,
      openRoofPermits: 0,
      longestOpenDays: null,
      ownerOccupied: true,
    });
    expect(none).toEqual({ score: 0, reasons: [] });
    const both = scoreLead({
      roofAgeYears: 40,
      roofBasisIsPermit: true,
      openRoofPermits: 2,
      longestOpenDays: 365 * 10,
      ownerOccupied: true,
    });
    expect(both.score).toBe(100);
    expect(both.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
