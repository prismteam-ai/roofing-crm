/**
 * EventBridge payload that keeps elephant-mcp DuckDB warm inside the tRPC Lambda.
 *
 * HTTP API integration timeout is ~29s; Lee MCP cold start is 30–90s. Warming
 * queryProperties on a schedule avoids evaluator 503s without provisioned
 * concurrency (this account's unreserved quota is 10).
 */
export const MCP_WARMUP_EVENT_SOURCE = "roofing-crm.mcp-warmup";

/** Fort Myers 2mi pin — same as `just warmup-search`. */
export const MCP_WARMUP_SEARCH_INPUT = {
  county: "lee",
  center: { lat: 26.6406, lng: -81.8723 },
  radiusMiles: 2,
  limit: 5,
} as const;

/**
 * True when EventBridge invoked the live alias with the MCP warmup payload.
 */
export function isMcpWarmupEvent(event: unknown): boolean {
  return (
    event !== null &&
    typeof event === "object" &&
    (event as { source?: unknown }).source === MCP_WARMUP_EVENT_SOURCE
  );
}
