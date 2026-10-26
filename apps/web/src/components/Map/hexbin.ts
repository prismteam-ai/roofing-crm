// Zoomed-out overview (design-review-log rows 10 and 69; CRM-HANDOFF E-67/E-72; prototype
// Explore1440 `heat`): properties aggregated into pointy-top hexagons in Web Mercator pixel space
// at the map's whole-number zoom, coloured by median roof age. The grid itself (projection, cell
// rounding, rings) is `@crm/domain`'s hexGrid, the same one `search.countyOverview`'s DuckDB SQL is
// pinned to, so a server cell and a client cell with the same id are the same hexagon.
//
// Two sources feed the hexagon layer: the server's whole-county cells (`overviewToHexCells`, the
// normal path), and — only when that overview cannot be read — the client binning of the
// properties loaded around a pin (`hexbin`), which the legend then labels as partial.
// The roof-age scale is the shared one in `src/format/buckets.ts`, never re-derived here.
import {
  DEFAULT_ROOF_AGE_YEARS,
  HEX_OVERVIEW_MAX_ZOOM,
  HEX_RADIUS_PX,
  hexAxialOf,
  hexCellCenter,
  hexCellId,
  hexCellRing,
} from "@crm/domain";
import { roofAgeBucket } from "../../format/buckets.js";

/** Below this zoom the map shows the hexagon overview; at or above it, individual markers.
 *  The county view opens at 9; a pin's radius view lands at 11–13. */
export const OVERVIEW_MAX_ZOOM = HEX_OVERVIEW_MAX_ZOOM;
export function isOverviewZoom(zoom: number): boolean {
  return zoom < OVERVIEW_MAX_ZOOM;
}

/** The county hexagon view: zoomed out AND no search centre. A dropped pin or GPS fix is a radius
 *  search whose results are listed beside the map, so they show as markers at any zoom (a 5 mi
 *  ring on a phone fits at zoom 10, below the overview threshold); "Recentre" with no pin
 *  returns to the county view. */
export function isOverviewView(zoom: number, hasCentre: boolean): boolean {
  return !hasCentre && isOverviewZoom(zoom);
}

export interface HexPoint {
  readonly lat: number;
  readonly lng: number;
  readonly roofAgeYears: number | null;
}

export interface HexCell {
  readonly id: string;
  /** Cell centre, [lng, lat]. */
  readonly center: readonly [number, number];
  /** Closed ring of seven [lng, lat] points. */
  readonly ring: readonly (readonly [number, number])[];
  readonly count: number;
  /** Properties with a published roof age. */
  readonly withRoofAge: number;
  /** Median of the published roof ages; null when none is published. */
  readonly medianRoofAge: number | null;
  /** Properties whose roof age is at least `agedYears`. */
  readonly agedCount: number;
}

export interface HexbinOptions {
  readonly zoom: number;
  /** Hexagon radius on screen at the whole-number zoom, px. */
  readonly radiusPx?: number;
  /** Aged-roof threshold, years (the Filters default is 15). */
  readonly agedYears?: number;
}

function median(sorted: readonly number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const mid = n >> 1;
  return n % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

interface Acc {
  q: number;
  r: number;
  count: number;
  ages: number[];
  aged: number;
}

export function hexbin(points: readonly HexPoint[], options: HexbinOptions): HexCell[] {
  const z = Math.max(0, Math.floor(options.zoom));
  const size = options.radiusPx ?? HEX_RADIUS_PX;
  const agedYears = options.agedYears ?? DEFAULT_ROOF_AGE_YEARS;
  const cells = new Map<string, Acc>();

  for (const point of points) {
    const { q, r } = hexAxialOf(point.lat, point.lng, z, size);
    const key = `${String(q)}:${String(r)}`;
    let acc = cells.get(key);
    if (acc === undefined) {
      acc = { q, r, count: 0, ages: [], aged: 0 };
      cells.set(key, acc);
    }
    acc.count += 1;
    const age = point.roofAgeYears;
    if (age !== null && Number.isFinite(age)) {
      acc.ages.push(age);
      if (age >= agedYears) acc.aged += 1;
    }
  }

  const out: HexCell[] = [];
  for (const acc of cells.values()) {
    acc.ages.sort((a, b) => a - b);
    out.push({
      id: hexCellId(z, acc.q, acc.r),
      center: hexCellCenter(acc.q, acc.r, z, size),
      ring: hexCellRing(acc.q, acc.r, z, size),
      count: acc.count,
      withRoofAge: acc.ages.length,
      medianRoofAge: median(acc.ages),
      agedCount: acc.aged,
    });
  }
  return out;
}

/** One `search.countyOverview` cell, structurally (the web never imports the API's types). */
export interface OverviewCellInput {
  readonly q: number;
  readonly r: number;
  readonly lat: number;
  readonly lng: number;
  readonly count: number;
  readonly withRoofAge: number;
  readonly medianRoofAge: number | null;
  readonly agedCount: number;
  readonly openPermits?: number;
  readonly stalledPermits?: number;
  readonly maxOpenDays?: number | null;
}

/** The server's whole-county cells as `HexCell`s: the ring is drawn from the shared grid at the
 *  response's own zoom, the centre is the server's (rounded) one. */
export function overviewToHexCells(cells: readonly OverviewCellInput[], zoom: number): HexCell[] {
  const z = Math.max(0, Math.floor(zoom));
  return cells.map((cell) => ({
    id: hexCellId(z, cell.q, cell.r),
    center: [cell.lng, cell.lat] as const,
    ring: hexCellRing(cell.q, cell.r, z),
    count: cell.count,
    withRoofAge: cell.withRoofAge,
    medianRoofAge: cell.medianRoofAge,
    agedCount: cell.agedCount,
  }));
}

/** A permit-cluster input point: one per cell that has counted permits, weighted by `permits`. */
export interface OverviewPermitPoint {
  readonly lat: number;
  readonly lng: number;
  readonly permits: number;
  readonly openDays: number;
}

export function overviewPermitPoints(cells: readonly OverviewCellInput[]): OverviewPermitPoint[] {
  const out: OverviewPermitPoint[] = [];
  for (const cell of cells) {
    const permits = (cell.openPermits ?? 0) + (cell.stalledPermits ?? 0);
    if (permits === 0) continue;
    out.push({ lat: cell.lat, lng: cell.lng, permits, openDays: cell.maxOpenDays ?? 0 });
  }
  return out;
}

export interface HexFeatureProperties {
  readonly id: string;
  readonly count: number;
  readonly medianRoofAge: number | null;
  readonly agedCount: number;
  /** The `--viz-roof-age-*` token of the median, or `none` when no roof age is published. */
  readonly token: string;
  readonly centerLng: number;
  readonly centerLat: number;
}

export interface HexFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: {
    readonly type: "Feature";
    readonly id: number;
    readonly properties: HexFeatureProperties;
    readonly geometry: {
      readonly type: "Polygon";
      readonly coordinates: (readonly (readonly [number, number])[])[];
    };
  }[];
}

export function hexCellsToFeatureCollection(cells: readonly HexCell[]): HexFeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((cell, index) => ({
      type: "Feature",
      id: index,
      properties: {
        id: cell.id,
        count: cell.count,
        medianRoofAge: cell.medianRoofAge,
        agedCount: cell.agedCount,
        token: roofAgeBucket(cell.medianRoofAge)?.token ?? "none",
        centerLng: cell.center[0],
        centerLat: cell.center[1],
      },
      geometry: { type: "Polygon", coordinates: [cell.ring] },
    })),
  };
}
