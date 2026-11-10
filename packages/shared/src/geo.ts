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
export const DEFAULTS = { radiusMiles: 2, minRoofAge: 15, minOpenYears: 5 } as const;

export function openDaysToYears(openDays: number | null): number | null {
  return openDays === null ? null : openDays / 365.25;
}

export function formatOpenDuration(openDays: number | null): string {
  if (openDays === null) return 'unknown';
  if (openDays < 60) return `${openDays} d`;
  if (openDays < 730) return `${Math.round(openDays / 30.44)} mo`;
  return `${(openDays / 365.25).toFixed(1)} y`;
}
