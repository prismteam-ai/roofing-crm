import type { Point } from './schemas.js';

export const EARTH_RADIUS_MILES = 3958.7613;
const MILES_PER_DEGREE_LAT = 69.0;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in miles. The SQL layer uses the same formula, so UI and API agree. */
export function haversineMiles(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Box that fully contains the search circle. Used as a cheap pre-filter so the exact
 * distance is only computed for rows near the pin, not for a million parcels.
 */
export function boundingBox(center: Point, radiusMiles: number): BBox {
  const dLat = radiusMiles / MILES_PER_DEGREE_LAT;
  const cosLat = Math.max(0.01, Math.cos(toRad(center.lat)));
  const dLon = radiusMiles / (MILES_PER_DEGREE_LAT * cosLat);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLon: center.lon - dLon,
    maxLon: center.lon + dLon,
  };
}

export function inBBox(p: Point, box: BBox): boolean {
  return p.lat >= box.minLat && p.lat <= box.maxLat && p.lon >= box.minLon && p.lon <= box.maxLon;
}

export const milesToMeters = (miles: number): number => miles * 1609.344;
