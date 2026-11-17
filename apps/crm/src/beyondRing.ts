import type { PointsResult } from "@oracle-la/api-client";
import { haversineMiles, type LatLon } from "@roofing-crm/geo";

/**
 * Upper bound, in miles, of how far a drawn point's distance can be from the data API's: parcels.points
 * rounds coordinates to 5 decimals (precision 5), at most about 0.72 m off here. The label's distance is
 * lowered by it, so "at or beyond" stays true for the parcels the API left out.
 */
export const COORD_ROUNDING_MILES = 0.0005;

/** The ring drawn when the map shows only the nearest max_points of the matching parcels. */
export interface BeyondRing {
  /** The search's pin (the ring's center). */
  center: LatLon;
  /** Distance from the pin to the farthest drawn point. */
  radiusMiles: number;
  /** Matching parcels not drawn: parcels.points count minus the points drawn. */
  notDrawn: number;
}

/**
 * The ring for a parcels.points result around the search's pin; undefined when the result is not truncated.
 * The points come nearest first, so the farthest is the last one; the maximum is taken anyway, so the ring
 * never passes inside a drawn point.
 */
export function beyondRingOf(
  center: LatLon,
  points: Pick<PointsResult, "count" | "id" | "lat" | "lon" | "truncated">,
): BeyondRing | undefined {
  if (!points.truncated || !points.id.length) return undefined;
  let radiusMiles = 0;
  for (let i = 0; i < points.id.length; i++)
    radiusMiles = Math.max(
      radiusMiles,
      haversineMiles(center, { lat: points.lat[i]!, lon: points.lon[i]! }),
    );
  return { center, radiusMiles, notDrawn: points.count - points.id.length };
}

/**
 * The ring's label. Parcels as far as the farthest drawn one may be among those left out (ties at that
 * distance), hence "at or beyond". The distance is rounded down to 0.01 mi (after COORD_ROUNDING_MILES), so
 * it never overstates where the left-out parcels start.
 */
export function beyondText({ radiusMiles, notDrawn }: BeyondRing): string {
  const miles = Math.max(
    0,
    Math.floor((radiusMiles - COORD_ROUNDING_MILES) * 100) / 100,
  );
  const n = notDrawn.toLocaleString("en-US");
  const d = miles.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n} matching parcel${notDrawn === 1 ? "" : "s"} not drawn: at or beyond the dashed ring, ${d} mi from the pin.`;
}
