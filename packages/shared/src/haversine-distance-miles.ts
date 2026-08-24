/**
 * Great-circle distance in statute miles between two WGS84 points.
 *
 * Used to clip bbox search results (and local demo parcels) to a true radius.
 */

/** Mean Earth radius in statute miles. */
const EARTH_RADIUS_MILES = 3958.7613;

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Returns Haversine distance in miles between two lat/lng pairs.
 */
export function haversineDistanceMiles(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const deltaLatitudeRadians = degreesToRadians(latitudeB - latitudeA);
  const deltaLongitudeRadians = degreesToRadians(longitudeB - longitudeA);
  const latitudeARadians = degreesToRadians(latitudeA);
  const latitudeBRadians = degreesToRadians(latitudeB);

  const chordLengthSquared =
    Math.sin(deltaLatitudeRadians / 2) ** 2 +
    Math.cos(latitudeARadians) *
      Math.cos(latitudeBRadians) *
      Math.sin(deltaLongitudeRadians / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(chordLengthSquared)));
}
