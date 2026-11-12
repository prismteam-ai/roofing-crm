/**
 * Map click hit test. Points open details only from DETAIL_MIN_ZOOM up; below it a click always drops the pin.
 * Measured on the pilot slice (21,394 points at 15 years): the median nearest-neighbour distance is 8.9 px at
 * zoom 15 (85% closer than 12 px = 2 x the tolerance) and 17.9 px at zoom 16 (0.2% closer than 12 px).
 */
export const DETAIL_MIN_ZOOM = 16;
/** Half-size of the click box, in pixels (a click within +/-6 px of a point hits it). */
export const HIT_TOLERANCE_PX = 6;

export interface PointLike {
  x: number;
  y: number;
}
export interface PointFeature {
  properties: { id?: unknown } | null;
  geometry: { type: string; coordinates?: unknown };
}

/**
 * The candidate nearest the click in pixels, or undefined. `project` maps [lon, lat] to screen pixels.
 * Ties (stacked points at the same location) open the LOWEST parcel id, so the choice is deterministic.
 */
export function nearestPoint<F extends PointFeature>(
  features: F[],
  click: PointLike,
  project: (lonLat: [number, number]) => PointLike,
): { id: string; feature: F } | undefined {
  let best: { id: string; feature: F; d: number } | undefined;
  for (const f of features) {
    const id = f.properties?.id;
    if (
      typeof id !== "string" ||
      f.geometry.type !== "Point" ||
      !Array.isArray(f.geometry.coordinates)
    )
      continue;
    const p = project(f.geometry.coordinates as [number, number]);
    const d = Math.hypot(p.x - click.x, p.y - click.y);
    if (!best || d < best.d || (d === best.d && id < best.id))
      best = { id, feature: f, d };
  }
  return best && { id: best.id, feature: best.feature };
}
