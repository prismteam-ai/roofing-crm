// The one Travis County bounding box (review finding M1/F1): the web map (bounds, "outside the
// county" refusal, GPS check, minimum zoom) and the API agent's scope check both import it, so a
// pin the map accepts is never one the agent calls out of scope.
import type { BoundingBox } from "./radius.js";

/**
 * A BOUNDING BOX around Travis County, not the county polygon: a point inside it may still lie
 * just across the county line (it then simply matches no indexed rows).
 *
 * Derived on 2026-10-26 from the Run 3 index (crm_property.parquet, 434,016 located properties):
 * longitude spans -98.1780 .. -97.3718, so west/east are those extremes rounded outward to 2 dp
 * (-98.18 / -97.37). Latitude is the Census TIGER county extent, 30.0246 .. 30.6286 (north
 * rounded outward to 30.6287 because Run 3 holds a property at 30.62868). A few Run 3 rows sit
 * south of 30.0246 (down to 29.83); they are outside the county and stay outside this box.
 */
export const TRAVIS_COUNTY_BBOX: BoundingBox = Object.freeze({
  south: 30.0246,
  north: 30.6287,
  west: -98.18,
  east: -97.37,
});

/** True when the point lies inside TRAVIS_COUNTY_BBOX (edges included). */
export function isInsideTravisCountyBbox(point: { lat: number; lng: number }): boolean {
  const { south, north, west, east } = TRAVIS_COUNTY_BBOX;
  return point.lat >= south && point.lat <= north && point.lng >= west && point.lng <= east;
}
