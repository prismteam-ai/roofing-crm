const EARTH_RADIUS_MILES = 3958.7613;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}

export const COOK_COUNTY_CENTER = { lat: 41.84, lon: -87.75 } as const;
export const DEFAULT_ZOOM = 10;
export const DEFAULTS = { radiusMiles: 2, minRoofAge: 15, minOpenYears: 2 } as const;
/** First-load search centre (Evanston) so the map is never empty. */
export const DEFAULT_CENTER = { lat: 42.0451, lon: -87.6877 } as const;

/** Cook County places for the "centre on a place" select (hardcoded, no geocoder needed). */
export const PLACES: readonly { name: string; lat: number; lon: number }[] = [
  { name: 'Chicago Loop', lat: 41.8819, lon: -87.6278 },
  { name: 'Evanston', lat: 42.0451, lon: -87.6877 },
  { name: 'Oak Park', lat: 41.885, lon: -87.7845 },
  { name: 'Skokie', lat: 42.0324, lon: -87.7416 },
  { name: 'Cicero', lat: 41.8456, lon: -87.7539 },
  { name: 'Berwyn', lat: 41.8506, lon: -87.7937 },
  { name: 'Schaumburg', lat: 42.0334, lon: -88.0834 },
  { name: 'Orland Park', lat: 41.6303, lon: -87.8539 },
  { name: 'Arlington Heights', lat: 42.0884, lon: -87.9806 },
  { name: 'Des Plaines', lat: 42.0334, lon: -87.8834 },
  { name: 'Oak Lawn', lat: 41.71, lon: -87.7581 },
  { name: 'Palatine', lat: 42.1103, lon: -88.0342 },
];

export const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;
export type Confidence = keyof typeof CONFIDENCE_RANK;

export function openDaysToYears(openDays: number | null): number | null {
  return openDays === null ? null : openDays / 365.25;
}

export function formatOpenDuration(openDays: number | null): string {
  if (openDays === null) return 'unknown';
  if (openDays < 60) return `${openDays} d`;
  if (openDays < 730) return `${Math.round(openDays / 30.44)} mo`;
  return `${(openDays / 365.25).toFixed(1)} y`;
}
