/** Map math for the CRM (no data logic; the roof-age rule lives in the data API). */
export const EARTH_RADIUS_MILES = 3958.8;
export const METERS_PER_MILE = 1609.344;
/** LA County bounds the map opens on: [west, south], [east, north]. */
export const LA_COUNTY_BOUNDS: [[number, number], [number, number]] = [
  [-118.95, 33.7],
  [-117.65, 34.82],
];
export interface LatLon {
  lat: number;
  lon: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in miles (same haversine as the API). */
export function haversineMiles(a: LatLon, b: LatLon): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}

/** Closed ring of [lon, lat] points approximating a circle of radiusMiles around center (spherical destination formula). */
export function circleRing(
  center: LatLon,
  radiusMiles: number,
  steps = 64,
): Array<[number, number]> {
  const d = radiusMiles / EARTH_RADIUS_MILES;
  const lat1 = rad(center.lat),
    lon1 = rad(center.lon);
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
        Math.cos(lat1) * Math.sin(d) * Math.cos(brg),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([deg(lon2), deg(lat2)]);
  }
  return ring;
}

export function insideBounds(p: LatLon, b = LA_COUNTY_BOUNDS): boolean {
  return (
    p.lon >= b[0][0] && p.lon <= b[1][0] && p.lat >= b[0][1] && p.lat <= b[1][1]
  );
}
