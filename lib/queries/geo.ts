import { num } from "./sql";

/**
 * Geodesic helpers shared by the SQL builders, the CRM's Postgres filters and the map.
 *
 * @module queries/geo
 */

/** Mean Earth radius in miles (matches the pipeline's documented radius SQL). */
export const EARTH_RADIUS_MILES = 3958.8;

/** A point in WGS84. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in miles between two points (haversine). */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * SQL expression computing haversine miles from `(latitude, longitude)` columns to the
 * given point. Only validated numbers are interpolated. Works in DuckDB and Postgres.
 */
export function haversineSql(center: LatLng, latCol = "latitude", lngCol = "longitude"): string {
  const lat = num(center.lat, { min: -90, max: 90 });
  const lng = num(center.lng, { min: -180, max: 180 });
  return (
    `${EARTH_RADIUS_MILES}*2*asin(sqrt(pow(sin(radians(${latCol}-(${lat}))/2),2)` +
    `+cos(radians(${lat}))*cos(radians(${latCol}))*pow(sin(radians(${lngCol}-(${lng}))/2),2)))`
  );
}

/** Bounding box (degrees) that fully contains a circle; used as a cheap SQL pre-filter. */
export function boundingBox(
  center: LatLng,
  radiusMiles: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const r = num(radiusMiles, { min: 0, max: 500 });
  const dLat = r / 69.0;
  const dLng = r / (69.0 * Math.max(0.1, Math.cos((center.lat * Math.PI) / 180)));
  return {
    minLat: num(center.lat - dLat),
    maxLat: num(center.lat + dLat),
    minLng: num(center.lng - dLng),
    maxLng: num(center.lng + dLng),
  };
}

/** SQL predicate restricting rows to the bounding box (cheap pre-filter before haversine). */
export function bboxSql(
  center: LatLng,
  radiusMiles: number,
  latCol = "latitude",
  lngCol = "longitude",
): string {
  const b = boundingBox(center, radiusMiles);
  return `${latCol} BETWEEN ${b.minLat} AND ${b.maxLat} AND ${lngCol} BETWEEN ${b.minLng} AND ${b.maxLng}`;
}

/** GeoJSON polygon approximating a circle; used to draw the search radius on the map. */
export function circlePolygon(
  center: LatLng,
  radiusMiles: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = radiusMiles / 69.0;
  const dLng = radiusMiles / (69.0 * Math.cos((center.lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([center.lng + dLng * Math.cos(t), center.lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
