/**
 * Geographic search-center point used by the map shell and radius search.
 *
 * Latitude/longitude are WGS84 decimal degrees.
 */
export interface SearchMapCenter {
  latitude: number;
  longitude: number;
}

/**
 * Fort Myers, FL — default search center while the catalog serves Lee (dev fallback).
 *
 * Used only when `defaultCountyKey` is `lee`; Chester published mode uses West Chester instead.
 */
export const LEE_FALLBACK_SEARCH_MAP_CENTER: SearchMapCenter = {
  latitude: 26.6406,
  longitude: -81.8723,
};

/** West Chester, PA — pin when Chester is the selected catalog county. */
export const CHESTER_PILOT_SEARCH_MAP_CENTER: SearchMapCenter = {
  latitude: 39.9607,
  longitude: -75.6055,
};

/** Norristown, PA — pin when Montgomery is the selected catalog county. */
export const MONTGOMERY_ROOF_AGE_DEMO_SEARCH_MAP_CENTER: SearchMapCenter = {
  latitude: 40.1215,
  longitude: -75.3399,
};

/**
 * County-seat pins for published Elephant catalog keys.
 *
 * Search still uses live parcels; these only aim the map when a county is chosen
 * or the operator recenters after panning away.
 */
export const SEARCH_MAP_CENTER_BY_COUNTY_KEY: Record<string, SearchMapCenter> = {
  lee: LEE_FALLBACK_SEARCH_MAP_CENTER,
  chester: CHESTER_PILOT_SEARCH_MAP_CENTER,
  "chester-demo": CHESTER_PILOT_SEARCH_MAP_CENTER,
  montgomery: MONTGOMERY_ROOF_AGE_DEMO_SEARCH_MAP_CENTER,
  "miami-dade": { latitude: 25.7617, longitude: -80.1918 },
  orange: { latitude: 28.5383, longitude: -81.3792 },
  "palm-beach": { latitude: 26.7153, longitude: -80.0534 },
  "rock-island": { latitude: 41.5095, longitude: -90.5787 },
};

/**
 * Default search radius in miles when the map shell first mounts.
 *
 * Keep this small: hosted `search.inRadius` is behind API Gateway's ~29s cap,
 * and Lee MCP bbox cost grows with radius². 2 mi matches `just warmup-search`.
 */
export const DEFAULT_SEARCH_RADIUS_MILES = 2;

/**
 * Resolves the search-center pin for a published catalog county key.
 *
 * Unknown keys fall back to Fort Myers so the map never recenters on invented
 * Chester coordinates when the catalog adds a county we have not pinned yet.
 */
export function resolveSearchMapCenterForCountyKey(countyKey: string): SearchMapCenter {
  const normalizedCountyKey = countyKey.trim().toLowerCase();
  const knownCenter = SEARCH_MAP_CENTER_BY_COUNTY_KEY[normalizedCountyKey];
  if (knownCenter !== undefined) {
    return { ...knownCenter };
  }
  return { ...LEE_FALLBACK_SEARCH_MAP_CENTER };
}

/**
 * Resolves the initial search center for a county catalog key.
 *
 * Lee fallback pins Fort Myers so sales never start centered on Chester coordinates.
 */
export function resolveInitialSearchMapCenter(
  defaultCountyKey: string,
): SearchMapCenter {
  return resolveSearchMapCenterForCountyKey(defaultCountyKey);
}
