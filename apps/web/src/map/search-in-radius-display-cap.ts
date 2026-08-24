/**
 * Display cap for radius-search candidates (list rows + map markers).
 *
 * The API serves at most the nearest 1,000 parcels inside the radius (Elephant
 * MCP row ceiling). The cap here only trims what is rendered — it never
 * changes which parcels the search found.
 */
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/** Preset caps offered in the list-header dropdown. */
export const SEARCH_IN_RADIUS_DISPLAY_CAP_OPTIONS = [100, 200, 400, 500, 1000] as const;

/** Default keeps the map readable while still showing a useful slice of results. */
export const DEFAULT_SEARCH_IN_RADIUS_DISPLAY_CAP = 200;

/** Slider bounds mirror the dropdown range in 100-roof steps. */
export const SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MIN = 100;
export const SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_MAX = 1000;
export const SEARCH_IN_RADIUS_DISPLAY_CAP_SLIDER_STEP = 100;

/** Prefix/suffix for the inline display-cap note in the roofs sheet. */
export const SEARCH_IN_RADIUS_NEAREST_CAP_PREFIX = "Search returns the nearest";
export const SEARCH_IN_RADIUS_NEAREST_CAP_SUFFIX = "roofs inside the radius.";

/**
 * Trims ranked candidates to the display cap (rank order is preserved).
 */
export function capSearchInRadiusCandidatesForDisplay(arguments_: {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  displayCap: number;
}): SearchInRadiusCandidate[] {
  if (arguments_.searchInRadiusCandidates.length <= arguments_.displayCap) {
    return arguments_.searchInRadiusCandidates;
  }
  return arguments_.searchInRadiusCandidates.slice(0, arguments_.displayCap);
}

/**
 * Header count copy — names the truncation when the cap hides rows.
 */
export function formatSearchInRadiusCandidateCountCopy(arguments_: {
  displayedCount: number;
  visibleCount: number;
  searchRadiusMiles: number;
}): string {
  if (arguments_.displayedCount < arguments_.visibleCount) {
    return `${String(arguments_.displayedCount)} of ${String(arguments_.visibleCount)} in ${String(arguments_.searchRadiusMiles)} mi`;
  }
  return `${String(arguments_.displayedCount)} in ${String(arguments_.searchRadiusMiles)} mi`;
}
