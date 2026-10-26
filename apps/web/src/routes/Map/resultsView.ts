// Pure helpers behind the results panel (boards CrmMap768 / CrmMapPin390): the row's "2.8 mi NW"
// distance and direction from the search centre, and the numbered pager over the rows the search
// loaded. No React, no I/O, so both are unit-tested on their own.
import { distanceMeters, METERS_PER_MILE, type LatLng } from "@crm/domain";
import { compassBearing } from "./Candidates/candidates.js";

/** Rows per page of the results panel. The server returns at most 100 rows; ten a page keeps the
 *  panel short and renders ten cards, not a hundred. */
export const RESULTS_PAGE_SIZE = 10;

export interface DistanceFromCentre {
  readonly miles: number;
  /** 8-point compass direction from the search centre to the property, e.g. `NW`. */
  readonly bearing: string;
}

/** Straight-line distance and compass direction from the search centre to a property; `null` when
 *  the property has no published coordinates (never a made-up place). */
export function distanceFromCentre(
  center: LatLng,
  latitude: number | null,
  longitude: number | null,
): DistanceFromCentre | null {
  if (latitude === null || longitude === null) return null;
  const to = { lat: latitude, lng: longitude };
  return {
    miles: distanceMeters(center, to) / METERS_PER_MILE,
    bearing: compassBearing(center, to),
  };
}

/** `2.8 mi NW`: one decimal, the unit, then the direction. */
export function directionLabel(value: DistanceFromCentre): string {
  return `${value.miles.toFixed(1)} mi ${value.bearing}`;
}

export type PageItem = number | "gap";

/** The page buttons of the pager: the first and last page, the current one and its neighbours, and
 *  a gap marker where pages are skipped (`1 2 … 9`). */
export function pageNumbers(current: number, pages: number): readonly PageItem[] {
  const keep = new Set<number>([1, pages, current - 1, current, current + 1]);
  const sorted = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (previous !== 0 && n - previous > 1) items.push("gap");
    items.push(n);
    previous = n;
  }
  return items;
}

export interface PageSlice {
  /** 0-based index of the first row on the page. */
  readonly start: number;
  /** 0-based index one past the last row on the page. */
  readonly end: number;
  readonly pages: number;
  /** The requested page, clamped into range (a shrinking result never leaves an empty page). */
  readonly page: number;
}

export function pageSlice(
  total: number,
  page: number,
  size: number = RESULTS_PAGE_SIZE,
): PageSlice {
  const pages = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(1, page), pages);
  const start = (clamped - 1) * size;
  return { start, end: Math.min(total, start + size), pages, page: clamped };
}
