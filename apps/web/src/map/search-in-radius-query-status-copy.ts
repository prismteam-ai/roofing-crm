/**
 * User-facing copy for live search.inRadius status in the roofs sheet.
 */

/**
 * Copy while radius search is in flight.
 */
export const SEARCH_IN_RADIUS_QUERY_PENDING_COPY = "Looking up roofs in this radius…";

/**
 * Copy when a hosted search is still in flight after the slow threshold.
 */
export const SEARCH_IN_RADIUS_QUERY_COLD_START_COPY =
  "Still loading roofs — the first lookup can take a few seconds.";

/** Delay before showing {@link SEARCH_IN_RADIUS_QUERY_COLD_START_COPY} (ms). */
export const SEARCH_IN_RADIUS_QUERY_SLOW_THRESHOLD_MS = 10_000;

/**
 * Copy when search.inRadius failed and the list has no parcels to show.
 */
export const SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY =
  "Roof search failed. Try again in a moment, or move the pin and widen the walk.";

/**
 * Copy when the API is reachable but parcel search is not wired.
 */
export const SEARCH_IN_RADIUS_QUERY_API_NOT_WIRED_COPY =
  "Roof search is not wired on this API yet. The map is ready, but roofs will not load until the backend is deployed.";

/**
 * Copy when the browser cannot reach the roof-search API.
 */
export const SEARCH_IN_RADIUS_QUERY_NETWORK_COPY =
  "Can't reach the roof-search API. Check your connection and try again.";

/**
 * Copy when the selected county is listed but not on the published map yet.
 */
export const SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY =
  "This county is listed but not searchable yet. Walk Lee County to convert doors.";

/**
 * Copy when RoofRadar AI cannot answer on a map-ready county.
 */
export const SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY =
  "RoofRadar AI cannot answer questions here yet. Use Roofs in this radius instead.";

/**
 * Coverage footnote when RoofRadar AI cannot answer yet.
 */
export const SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY =
  "Lee County sample records only. Chester County is not included.";

/**
 * Maps raw tRPC / fetch errors to honest operator copy.
 */
export function resolveSearchInRadiusQueryErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY;

  if (/transport is not configured|wire MCP in the Lambda handler/i.test(raw)) {
    return SEARCH_IN_RADIUS_QUERY_API_NOT_WIRED_COPY;
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return SEARCH_IN_RADIUS_QUERY_NETWORK_COPY;
  }
  if (
    /failed with HTTP 5\d\d/i.test(raw) ||
    /HTTP 5\d\d/i.test(raw) ||
    /\b503\b/.test(raw) ||
    /Service Unavailable/i.test(raw) ||
    /INTERNAL_SERVER_ERROR/i.test(raw)
  ) {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY;
  }
  if (raw.startsWith("search.inRadius failed:")) {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY;
  }
  if (raw.length > 140) {
    return SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY;
  }
  return raw;
}
