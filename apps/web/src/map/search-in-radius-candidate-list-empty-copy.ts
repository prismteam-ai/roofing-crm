/**
 * Empty-list copy for the search-candidate sidebar.
 *
 * Distinguishes “no parcels in the radius” from “the structure-year filter hid them.”
 * Idle (`no_pin`) names where roofs land; the map HUD owns the drag instruction.
 */
import { SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY } from "./search-in-radius-query-status-copy";

/**
 * Idle copy when the roofs sheet is open but no ping is on the plat.
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_NO_PIN_COPY =
  "No roofs in your radar yet.";

/**
 * Copy when radius search returned no parcels (pin in water / sparse area).
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY =
  "No roofs in this radius. Widen the walk or drop the pin on another block.";

/**
 * Copy when parcels exist but the aging-roof (structure-year) filter hid all of them.
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_AGING_FILTER_EMPTY_COPY =
  "No roofs match older structures. Turn off the structure-year filter to see the rest, including unknown year.";

/**
 * Copy when parcels exist but the long-open permit layer hid all of them.
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_PERMIT_FILTER_EMPTY_COPY =
  "No long-open roofing permits in this radius. Turn off the permit layer to see every roof, or widen the walk.";

/**
 * Copy when pin/radius chrome is on but live search.inRadius is not wired.
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_NOT_CONNECTED_COPY =
  "Pin and radius are ready. Roof search is not connected yet, so this list stays empty.";

/**
 * Copy when live search.inRadius failed (distinct from an honest empty radius).
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_EMPTY_COPY =
  "Roof search did not find any roofs. Try again, or move the pin and widen the walk.";

/**
 * Why the candidate list is empty.
 */
export type SearchInRadiusCandidateListEmptyReason =
  | "no_pin"
  | "no_radius_results"
  | "aging_roof_filter"
  | "permit_layer_filter"
  | "search_not_connected"
  | "search_failed"
  | "county_not_map_ready";

/**
 * Picks empty-list copy from the empty reason.
 */
export function resolveSearchInRadiusCandidateListEmptyCopy(
  emptyReason: SearchInRadiusCandidateListEmptyReason,
): string {
  if (emptyReason === "no_pin") {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_NO_PIN_COPY;
  }
  if (emptyReason === "aging_roof_filter") {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_AGING_FILTER_EMPTY_COPY;
  }
  if (emptyReason === "permit_layer_filter") {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_PERMIT_FILTER_EMPTY_COPY;
  }
  if (emptyReason === "search_not_connected") {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_NOT_CONNECTED_COPY;
  }
  if (emptyReason === "search_failed") {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_EMPTY_COPY;
  }
  if (emptyReason === "county_not_map_ready") {
    return SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY;
  }
  return SEARCH_IN_RADIUS_CANDIDATE_LIST_EMPTY_COPY;
}

/**
 * Splits empty-list copy into the fact and the next action.
 */
export function splitSearchInRadiusCandidateListEmptyCopy(copy: string): {
  fact: string;
  recovery: string;
} {
  const splitAt = copy.indexOf(". ");
  if (splitAt === -1) {
    return { fact: copy, recovery: "" };
  }
  return {
    fact: copy.slice(0, splitAt + 1),
    recovery: copy.slice(splitAt + 2),
  };
}
