import type { LatLon } from "@crm/shared";
import { BROWARD } from "oracle-broward/contract";

/** Whether a search center lies in the county the Oracle covers (its bounding box, from the contract). */
export function isInsideCoverage(c: LatLon): boolean {
  const b = BROWARD.bbox;
  return c.lat >= b.minLat && c.lat <= b.maxLat && c.lon >= b.minLon && c.lon <= b.maxLon;
}
