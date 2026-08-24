/**
 * HTTP API search must not hold Lambda past the ~29s gateway budget.
 *
 * A 5-mile queryProperties that keeps running for 110s after API Gateway 503s
 * starves leads.archive (account concurrency quota is 10).
 */
import { describe, expect, it } from "vitest";
import {
  ELEPHANT_MCP_FAST_TOOL_TIMEOUT_MS,
  ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS,
  ELEPHANT_MCP_TOOL_TIMEOUT_MS,
  elephantMcpTimeoutStore,
  resolveElephantMcpToolTimeoutMs,
} from "./elephant-mcp-stdio-tool-client.js";

describe("HTTP vs warmup queryProperties timeout", () => {
  it("keeps browser queryProperties inside the HTTP API budget", () => {
    const timeoutMs = elephantMcpTimeoutStore.run(
      { queryPropertiesTimeoutMs: ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS },
      () => resolveElephantMcpToolTimeoutMs("queryProperties"),
    );

    expect(timeoutMs).toBe(ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS);
    expect(timeoutMs).toBeLessThan(29_000);
    expect(resolveElephantMcpToolTimeoutMs("getOracleProperty")).toBe(
      ELEPHANT_MCP_FAST_TOOL_TIMEOUT_MS,
    );
  });

  it("keeps EventBridge warmup on the full Lambda DuckDB budget", () => {
    expect(resolveElephantMcpToolTimeoutMs("queryProperties")).toBe(
      ELEPHANT_MCP_TOOL_TIMEOUT_MS,
    );
    expect(ELEPHANT_MCP_TOOL_TIMEOUT_MS).toBeGreaterThan(29_000);
  });
});
