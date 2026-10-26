// Pure radius math (plan.md "Patterns the code must show"; data-model.md): the one place the
// map, the API and (later) the agent compute which rows are "in radius" (architecture-
// constitution.md §5's "no threshold or label is ever written twice"). `bboxFor` is a cheap
// superset prefilter for a SQL WHERE clause; `distanceMeters` is the exact great-circle cut and
// the "nearest first" sort key. Earth radius matches testplans/B-03-test-cases.md §3's
// haversine convention (3,958.8 mi == 6,371,008.8 m) so the UI, the API and the test cases never
// disagree on what "inside the circle" means.
import { EARTH_RADIUS_M, METERS_PER_MILE } from "./constants.js";

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface BoundingBox {
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
}

const EARTH_RADIUS_METERS = EARTH_RADIUS_M;
const DEGREES_PER_RADIAN = 180 / Math.PI;

/** The 0.5-25 mi radius bound (FR-001/data-model.md) — the one source of truth: every caller
 *  (ExploreFilters.state.ts, RadiusControl.tsx, search.ts's Zod input) imports these instead of
 *  repeating the literals (found in review, CR-B-03). */
export const MIN_RADIUS_MI = 0.5;
export const MAX_RADIUS_MI = 25;

/** A rectangular superset of the radiusMi circle around center, degrees of lat/lng (data-model.md). */
export function bboxFor(center: LatLng, radiusMi: number): BoundingBox {
  const radiusMeters = radiusMi * METERS_PER_MILE;
  const latDelta = (radiusMeters / EARTH_RADIUS_METERS) * DEGREES_PER_RADIAN;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  // Guard against the pole, where cos(lat) -> 0 and a longitude delta would blow up; a bbox
  // spanning the full longitude range is still a valid (if looser) superset there.
  const lngDelta =
    Math.abs(cosLat) < 1e-6
      ? 180
      : (radiusMeters / (EARTH_RADIUS_METERS * cosLat)) * DEGREES_PER_RADIAN;
  return {
    south: center.lat - latDelta,
    north: center.lat + latDelta,
    west: center.lng - lngDelta,
    east: center.lng + lngDelta,
  };
}

/** Haversine great-circle distance in meters between two lat/lng points. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/** Converts a radius in miles to meters, for the exact-circle cut (`distanceMeters(...) < radiusMi * MILE`). */
export function milesToMeters(miles: number): number {
  return miles * METERS_PER_MILE;
}
