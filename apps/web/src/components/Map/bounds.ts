// research.md "client-side MapLibre bounds guarantee, no server round trip": minZoom is computed
// once from map.cameraForBounds(countyBbox); maxBounds is left unset so pan/zoom stays
// unrestricted (AC-2's "no artificial limit" + "always renders at least the county box"). Split
// out from CrmMap.tsx so T012's unit test exercises this pure logic without a real WebGL canvas.
// Tuples are mutable (not `readonly`) so they structurally satisfy maplibre-gl's own
// `LngLatLike`/`LngLatBoundsLike` types without a cast.
import { TRAVIS_COUNTY_BBOX, isInsideTravisCountyBbox } from "@crm/domain";

export const TRAVIS_COUNTY_CENTER: [number, number] = [-97.7431, 30.2672];

/** Travis County, TX bounding box as MapLibre bounds: southwest, northeast. Built from the one
 *  shared `TRAVIS_COUNTY_BBOX` (`@crm/domain`), which the API agent's scope check also uses. */
export const TRAVIS_COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [TRAVIS_COUNTY_BBOX.west, TRAVIS_COUNTY_BBOX.south],
  [TRAVIS_COUNTY_BBOX.east, TRAVIS_COUNTY_BBOX.north],
];

export interface CameraForBoundsResult {
  readonly zoom?: number;
}

/** The subset of maplibre-gl's Map type this module needs — kept narrow so it's mockable. */
export interface CameraForBoundsMap {
  cameraForBounds(
    bounds: [[number, number], [number, number]],
  ): CameraForBoundsResult | null | undefined;
}

/**
 * The minimum zoom that still shows the whole county — derived once from `cameraForBounds`, not
 * a literal. Returns `undefined` (no minZoom set) if MapLibre can't compute a camera for the
 * bounds, rather than guessing a value.
 */
export function computeMinZoom(map: CameraForBoundsMap): number | undefined {
  const camera = map.cameraForBounds(TRAVIS_COUNTY_BOUNDS);
  return camera?.zoom;
}

/**
 * The MapLibre `Map` constructor options this story requires: a fixed center, no `maxBounds`
 * (free pan/zoom — AC-2's "no artificial limit"). `minZoom` is added separately on `load`/resize
 * once `computeMinZoom` can run against the real map instance.
 */
export interface CrmMapInitOptions {
  readonly center: [number, number];
  readonly maxBounds?: never;
}

export function buildMapInitOptions(): CrmMapInitOptions {
  return { center: TRAVIS_COUNTY_CENTER };
}

/**
 * B-03 AC-1's edge case 2 / AC-2's outside-county state: a cheap bbox containment check against
 * `TRAVIS_COUNTY_BOUNDS` — the same box the map itself always renders at minimum, so "outside the
 * covered county" and "outside the box the map guarantees" are the same answer. Not a true county
 * polygon (none is vendored for this story), so it is a conservative approximation: a point just
 * outside the real county line but still inside this box reads as "in coverage". Good enough for
 * the story's named edge case (Williamson County is well outside this box in every direction).
 */
export function isInTravisCounty(point: { lat: number; lng: number }): boolean {
  return isInsideTravisCountyBbox(point);
}

/** [[west, south], [east, north]]. */
export type LngLatBox = [[number, number], [number, number]];

/** The smallest box holding both: used so a fit to the search results still shows the whole search
 *  ring (the pin drop's results are usually a small cluster inside a much larger ring). `null`
 *  `points` (no results) gives the ring box. */
export function unionBox(
  ring: LngLatBox,
  points: readonly { lat: number; lng: number }[],
): LngLatBox {
  let west = ring[0][0];
  let south = ring[0][1];
  let east = ring[1][0];
  let north = ring[1][1];
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}
