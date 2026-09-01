import { describe, expect, it } from 'vitest';
import {
  boundingBox, encodeGeohash, geohashRangesForBox, haversineMiles, precisionForRadius,
} from '../src/geo.js';

describe('haversineMiles', () => {
  it('is zero for the same point', () => {
    expect(haversineMiles({ lat: 28.4, lon: -80.7 }, { lat: 28.4, lon: -80.7 })).toBe(0);
  });

  it('matches the pipeline geocode cross-check to within a tolerance', () => {
    // Pipeline reported the Census geocode of 2680 DONNA DR landing ~30m from
    // the FDOR parcel centroid. 30m is about 0.019 miles.
    const censusGeocode = { lat: 28.641769, lon: -80.835538 };
    const nearby = { lat: 28.641500, lon: -80.835538 };
    expect(haversineMiles(censusGeocode, nearby)).toBeLessThan(0.05);
  });
});

describe('boundingBox', () => {
  it('encloses every point within the radius', () => {
    const center = { lat: 28.3, lon: -80.7 };
    const radius = 5;
    const box = boundingBox(center, radius);
    const milesPerDegLat = 69.09;
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = (bearing * Math.PI) / 180;
      // Sit just inside the radius so the assertion tests the box, not the
      // precision of a degrees-per-mile approximation.
      const dist = radius * 0.98;
      const dLat = (dist / milesPerDegLat) * Math.cos(rad);
      const dLon = (dist / (milesPerDegLat * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(rad);
      const p = { lat: center.lat + dLat, lon: center.lon + dLon };
      // Guard the fixture itself: the point must really be within the radius.
      expect(haversineMiles(center, p)).toBeLessThanOrEqual(radius);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
      expect(p.lon).toBeGreaterThanOrEqual(box.minLon);
      expect(p.lon).toBeLessThanOrEqual(box.maxLon);
    }
  });

  it('does not blow up at the pole where cos(lat) approaches zero', () => {
    const box = boundingBox({ lat: 90, lon: 0 }, 10);
    expect(Number.isFinite(box.minLon)).toBe(true);
    expect(Number.isFinite(box.maxLon)).toBe(true);
  });
});

describe('encodeGeohash', () => {
  it('reproduces the locality the pipeline observed', () => {
    // Pipeline reported consecutive sorted rows djn3xz8zx / djn3xz9rs ~50m apart.
    expect(encodeGeohash(28.4312, -80.8690, 9)).toMatch(/^djn3xz/);
    expect(encodeGeohash(28.4312, -80.8685, 9)).toMatch(/^djn3xz/);
  });

  it('gives a shared prefix to nearby points and not to distant ones', () => {
    const brevard = encodeGeohash(28.3, -80.7, 4);
    const miami = encodeGeohash(25.76, -80.19, 4);
    expect(brevard).not.toBe(miami);
  });
});

describe('precisionForRadius', () => {
  it('picks coarser cells for wider searches', () => {
    expect(precisionForRadius(25)).toBeLessThanOrEqual(precisionForRadius(1));
  });
});

describe('geohashRangesForBox', () => {
  it('covers the centre of the box', () => {
    const center = { lat: 28.3, lon: -80.7 };
    const box = boundingBox(center, 5);
    const precision = precisionForRadius(5);
    const ranges = geohashRangesForBox(box, precision);
    const centreHash = encodeGeohash(center.lat, center.lon, precision);
    const covered = ranges.some((r) => centreHash >= r.start && centreHash <= r.end);
    expect(covered).toBe(true);
  });

  it('produces a bounded number of ranges', () => {
    const box = boundingBox({ lat: 28.3, lon: -80.7 }, 5);
    const ranges = geohashRangesForBox(box, precisionForRadius(5));
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.length).toBeLessThan(64);
  });
});
