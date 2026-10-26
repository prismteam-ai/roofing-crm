// Clicking a hexagon of the county overview opens the radius view there: the pin goes to the cell's
// centre (the same grid and centres the API computes, @crm/domain hexGrid) and the radius covers
// the clicked cell. Pure helpers, so the map component and its tests share one rule.
import {
  DEFAULT_RADIUS_MI,
  HEX_RADIUS_PX,
  HEX_TILE_PX,
  MAX_RADIUS_MI,
  METERS_PER_MILE,
  MIN_RADIUS_MI,
  RADIUS_STEP_MI,
} from "@crm/domain";

/** Metres in a Web Mercator world at the equator (the same projection the hex grid uses). */
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** A cell's circumradius (centre to corner) in miles at `lat`, for a grid at whole-number `zoom`. */
export function hexCircumradiusMi(lat: number, zoom: number): number {
  const metersPerPixel =
    (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (HEX_TILE_PX * 2 ** zoom);
  return (HEX_RADIUS_PX * metersPerPixel) / METERS_PER_MILE;
}

/** The search radius for a clicked cell: the rep's own radius when it already covers the cell
 *  (the default when none was set), else the circumradius rounded up to the control's step; always
 *  inside the control's bounds. */
export function hexSearchRadiusMi(
  lat: number,
  zoom: number,
  currentRadiusMi: number | undefined,
): number {
  const base = currentRadiusMi ?? DEFAULT_RADIUS_MI;
  const cover = Math.ceil(hexCircumradiusMi(lat, zoom) / RADIUS_STEP_MI) * RADIUS_STEP_MI;
  return Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, base, cover));
}

/** The zoom a cell id (`{zoom}:{q}:{r}`) was made at, or null when the id is malformed. */
export function parseHexZoom(id: string): number | null {
  const zoom = Number(id.split(":")[0]);
  return Number.isInteger(zoom) && id.split(":").length === 3 ? zoom : null;
}

/** The accessible name of a cell. */
export function hexCellLabel(cell: {
  readonly medianRoofAge: number | null;
  readonly count: number;
}): string {
  const roof =
    cell.medianRoofAge === null
      ? "no roof age published"
      : `median roof age ${String(cell.medianRoofAge)} years`;
  const properties = `${cell.count.toLocaleString("en-US")} ${cell.count === 1 ? "property" : "properties"}`;
  return `Hexagon, ${roof}, ${properties}, open here`;
}
