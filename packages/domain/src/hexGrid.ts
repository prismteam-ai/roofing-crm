// The map overview's hexagon grid (design-review-log rows 10 and 69): pointy-top hexagons in Web
// Mercator pixel space at a whole-number zoom. Shared by the web map (apps/web hexbin.ts) and the
// API's `search.countyOverview` DuckDB aggregate (apps/api adapters/duckDbParquet.ts), so a cell
// id means the same hexagon on both sides. The SQL twin of `hexAxialOf` lives in the adapter and
// is pinned to this function by apps/api/test/countyOverview.test.ts. Pure, no dependency.

/** Web Mercator tile size, px. */
export const HEX_TILE_PX = 256;
/** Hexagon radius on screen at the whole-number zoom, px. */
export const HEX_RADIUS_PX = 24;
/** Below this zoom the map shows the hexagon overview; at or above it, individual markers. */
export const HEX_OVERVIEW_MAX_ZOOM = 11;

const SQRT3 = Math.sqrt(3);

export interface HexAxial {
  readonly q: number;
  readonly r: number;
}

/** World size in px at the whole-number part of `zoom`. */
export function hexWorldSize(zoom: number): number {
  return HEX_TILE_PX * 2 ** Math.max(0, Math.floor(zoom));
}

export function projectMercator(lng: number, lat: number, world: number): [number, number] {
  const x = ((lng + 180) / 360) * world;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  return [x, y];
}

export function unprojectMercator(x: number, y: number, world: number): [number, number] {
  const lng = (x / world) * 360 - 180;
  const n = Math.PI * (1 - (2 * y) / world);
  const lat = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return [lng, lat];
}

/** Axial (q, r) of the hexagon containing pixel (x, y), cube-rounded. `Math.round` rounds half
 *  up (towards +∞); the SQL twin uses `floor(v + 0.5)` for the same reason. */
export function hexAxialOfPixel(x: number, y: number, size: number = HEX_RADIUS_PX): HexAxial {
  const qf = ((SQRT3 / 3) * x - y / 3) / size;
  const rf = ((2 / 3) * y) / size;
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // `+ 0` turns a -0 into 0, so a cell id never reads "-0".
  return { q: q + 0, r: r + 0 };
}

/** The cell containing (lat, lng) at `zoom`. */
export function hexAxialOf(
  lat: number,
  lng: number,
  zoom: number,
  size: number = HEX_RADIUS_PX,
): HexAxial {
  const [x, y] = projectMercator(lng, lat, hexWorldSize(zoom));
  return hexAxialOfPixel(x, y, size);
}

/** Cell centre, [lng, lat]. */
export function hexCellCenter(
  q: number,
  r: number,
  zoom: number,
  size: number = HEX_RADIUS_PX,
): [number, number] {
  return unprojectMercator(size * SQRT3 * (q + r / 2), size * 1.5 * r, hexWorldSize(zoom));
}

/** Closed ring of seven [lng, lat] points. */
export function hexCellRing(
  q: number,
  r: number,
  zoom: number,
  size: number = HEX_RADIUS_PX,
): [number, number][] {
  const world = hexWorldSize(zoom);
  const cx = size * SQRT3 * (q + r / 2);
  const cy = size * 1.5 * r;
  const ring: [number, number][] = [];
  for (let i = 0; i <= 6; i += 1) {
    const angle = ((60 * (i % 6) - 30) * Math.PI) / 180;
    ring.push(unprojectMercator(cx + size * Math.cos(angle), cy + size * Math.sin(angle), world));
  }
  return ring;
}

export function hexCellId(zoom: number, q: number, r: number): string {
  return `${Math.max(0, Math.floor(zoom))}:${q}:${r}`;
}
