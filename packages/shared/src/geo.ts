/** Geospatial helpers for radius search over geohash-sorted Parquet. */

const EARTH_RADIUS_MILES = 3958.7613;
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface LatLon { lat: number; lon: number }
export interface BoundingBox { minLat: number; maxLat: number; minLon: number; maxLon: number }

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in miles. Used to refine after cheap predicates prune. */
export function haversineMiles(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bounding box enclosing a radius. Slightly over-covers near the poles, which is
 * the safe direction — a too-small box would silently drop matching rows.
 */
export function boundingBox(center: LatLon, radiusMiles: number): BoundingBox {
  const latDelta = (radiusMiles / EARTH_RADIUS_MILES) * (180 / Math.PI);
  const cosLat = Math.cos(toRad(center.lat));
  // Guard against division blowing up as cos(lat) approaches 0.
  const lonDelta = Math.abs(cosLat) < 1e-9 ? 180 : latDelta / Math.abs(cosLat);
  return {
    minLat: Math.max(-90, center.lat - latDelta),
    maxLat: Math.min(90, center.lat + latDelta),
    minLon: Math.max(-180, center.lon - lonDelta),
    maxLon: Math.min(180, center.lon + lonDelta),
  };
}

/** Standard geohash encode (base32, lon/lat interleaved). */
export function encodeGeohash(lat: number, lon: number, precision = 9): string {
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) { ch = (ch << 1) | 1; lonMin = mid; } else { ch <<= 1; lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latMin = mid; } else { ch <<= 1; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[ch] ?? '0'; bit = 0; ch = 0; }
  }
  return hash;
}

/** Approximate geohash cell dimensions in miles, by prefix length. */
const CELL_SIZE_MILES: Record<number, { w: number; h: number }> = {
  1: { w: 3125, h: 2500 }, 2: { w: 781, h: 391 }, 3: { w: 97.6, h: 97.6 },
  4: { w: 24.4, h: 12.2 }, 5: { w: 3.05, h: 3.05 }, 6: { w: 0.76, h: 0.38 },
  7: { w: 0.095, h: 0.095 },
};

/**
 * Shortest geohash precision whose cells are no larger than the search radius,
 * so a covering set stays small but still prunes usefully.
 */
export function precisionForRadius(radiusMiles: number): number {
  for (let p = 1; p <= 7; p++) {
    const cell = CELL_SIZE_MILES[p];
    if (cell && Math.max(cell.w, cell.h) <= Math.max(radiusMiles, 0.05)) return p;
  }
  return 7;
}

/**
 * Contiguous geohash prefix ranges covering a bounding box.
 *
 * Rows are written geohash-sorted, so row-group min/max on that column are
 * non-overlapping and ordered — unlike lat/lon, whose ranges overlap within a
 * file because the geohash is a Z-order curve. Predicating on these ranges
 * therefore prunes whole row groups that a lat-only predicate would read.
 */
export function geohashRangesForBox(box: BoundingBox, precision: number): { start: string; end: string }[] {
  const cell = CELL_SIZE_MILES[precision] ?? CELL_SIZE_MILES[7]!;
  const latStep = (cell.h / EARTH_RADIUS_MILES) * (180 / Math.PI);
  const lonStep = (cell.w / EARTH_RADIUS_MILES) * (180 / Math.PI);

  const prefixes = new Set<string>();
  for (let lat = box.minLat; lat <= box.maxLat + latStep; lat += latStep) {
    for (let lon = box.minLon; lon <= box.maxLon + lonStep; lon += lonStep) {
      prefixes.add(encodeGeohash(Math.min(lat, box.maxLat), Math.min(lon, box.maxLon), precision));
    }
  }
  // Corners can fall outside the stepped grid when the box is smaller than a cell.
  prefixes.add(encodeGeohash(box.minLat, box.minLon, precision));
  prefixes.add(encodeGeohash(box.maxLat, box.maxLon, precision));
  prefixes.add(encodeGeohash(box.minLat, box.maxLon, precision));
  prefixes.add(encodeGeohash(box.maxLat, box.minLon, precision));

  const sorted = [...prefixes].sort();
  const ranges: { start: string; end: string }[] = [];
  for (const prefix of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && isNextPrefix(last.end, prefix)) {
      last.end = prefix;
    } else {
      ranges.push({ start: prefix, end: prefix });
    }
  }
  return ranges;
}

/** True when `b` is the immediate base32 successor of `a` at the same precision. */
function isNextPrefix(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  if (a.slice(0, -1) !== b.slice(0, -1)) return false;
  const ia = BASE32.indexOf(a[a.length - 1]!);
  const ib = BASE32.indexOf(b[b.length - 1]!);
  return ia >= 0 && ib === ia + 1;
}

/** Exclusive upper bound for a prefix range, for `geohash >= start AND geohash < end`. */
export function prefixUpperBound(prefix: string): string {
  return `${prefix}~`; // '~' sorts after every base32 character
}
