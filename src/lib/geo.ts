import type { Pin, PolygonFeature } from "./types";

export const EARTH_RADIUS_MILES = 3958.8;

/** Plain-SQL haversine distance in miles (no spatial extension). lat/lon are numeric column or literal expressions. */
export function haversineSql(pin: Pin, latCol = "lat", lonCol = "lon"): string {
  const la = Number(pin.lat), lo = Number(pin.lon);
  return `(2 * ${EARTH_RADIUS_MILES} * asin(sqrt(` +
    `pow(sin(radians(${latCol} - (${la})) / 2), 2) + ` +
    `cos(radians(${la})) * cos(radians(${latCol})) * pow(sin(radians(${lonCol} - (${lo})) / 2), 2))))`;
}

/** Cheap bounding-box prefilter so haversine only runs on nearby rows. */
export function bboxSql(pin: Pin, miles: number, latCol = "lat", lonCol = "lon"): string {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.max(0.01, Math.cos((pin.lat * Math.PI) / 180)));
  return `${latCol} BETWEEN ${pin.lat - dLat} AND ${pin.lat + dLat} AND ${lonCol} BETWEEN ${pin.lon - dLon} AND ${pin.lon + dLon}`;
}

/** Client-side haversine in miles (used to filter saved leads). */
export function haversineMiles(a: Pin, b: Pin): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** GeoJSON polygon approximating a circle of `miles` around `pin`. */
export function circleGeoJson(pin: Pin, miles: number, steps = 96): PolygonFeature {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([pin.lon + (miles / (69 * Math.cos((pin.lat * Math.PI) / 180))) * Math.cos(t), pin.lat + (miles / 69) * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
