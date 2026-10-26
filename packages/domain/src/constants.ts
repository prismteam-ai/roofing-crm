// Shared numeric constants (review findings M10, F5, F8): one definition each, imported by the
// web and the API instead of repeated literals that could drift apart.

/** Mean days per year. The one year-to-day conversion everywhere (365 and 365.25 had both been used). */
export const DAYS_PER_YEAR = 365.25;

/** Whole days for a number of years, rounded up: the server's day threshold for "N or more years". */
export function yearsToDays(years: number): number {
  return Math.ceil(years * DAYS_PER_YEAR);
}

/** Metres per statute mile. */
export const METERS_PER_MILE = 1609.344;
/** Mean Earth radius in metres (matches the haversine in radius.ts). */
export const EARTH_RADIUS_M = 6_371_008.8;

/** The radius a search uses when the rep never set one. */
export const DEFAULT_RADIUS_MI = 5;
/** The radius control's step. */
export const RADIUS_STEP_MI = 0.5;
/** "Widen the search" grows the radius by this many miles, never by doubling. */
export const WIDEN_STEP_MI = 1;

/** The map opens on the whole county at this zoom. */
export const COUNTY_ZOOM = 9;

/** Most property rows one `search.properties` call returns (architecture-constitution.md section 6). */
export const MAX_PROPERTY_ROWS = 100;
/** Most permit rows one `search.permits` page returns. */
export const MAX_PERMIT_ROWS = 500;
/** Most rows "Similar properties" may ask for, and its default. */
export const MAX_SIMILAR_ROWS = 10;
export const DEFAULT_SIMILAR_ROWS = 5;
