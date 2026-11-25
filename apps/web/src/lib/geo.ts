import { boundingBox, EARTH_RADIUS_MILES, type Point } from '@roofing-crm/shared';

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Polygon ring approximating a circle on the globe, for drawing the search radius. */
export function circlePolygon(
  center: Point,
  radiusMiles: number,
  steps = 72,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const angular = radiusMiles / EARTH_RADIUS_MILES;
  const lat1 = toRad(center.lat);
  const lon1 = toRad(center.lon);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([toDeg(lon2), toDeg(lat2)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export type LngLatBox = [[number, number], [number, number]];

/** [[west, south], [east, north]] around the search circle, for fitting the map to it. */
export function circleBounds(center: Point, radiusMiles: number): LngLatBox {
  const box = boundingBox(center, radiusMiles);
  return [
    [box.minLon, box.minLat],
    [box.maxLon, box.maxLat],
  ];
}

export const roundCoord = (value: number): number => Number(value.toFixed(5));
