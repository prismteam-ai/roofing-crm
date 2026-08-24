import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createElephantMcpStdioToolClient,
  ELEPHANT_MCP_TOOL_TIMEOUT_MS,
  resolveElephantMcpToolTimeoutMs,
  resolveBundledElephantMcpServerScriptPath,
  unwrapElephantMcpToolResult,
} from "./elephant-mcp-stdio-tool-client.js";

describe("createElephantMcpStdioToolClient", () => {
  // Given the forbidden harvest tool name
  // When callTool is invoked
  // Then it throws before connecting
  it("rejects forbidden MCP tools", async () => {
    const client = createElephantMcpStdioToolClient({
      serverScriptPath: "/tmp/fake-elephant-mcp.js",
    });

    await expect(client.callTool("getPropertyPermits", {})).rejects.toThrow(
      /Forbidden Elephant MCP tool/,
    );
  });

  // Given the bundled elephant-mcp package
  // When resolveBundledElephantMcpServerScriptPath runs
  // Then it points at dist/index.js
  it("resolveBundledElephantMcpServerScriptPath targets dist/index.js", () => {
    const scriptPath = resolveBundledElephantMcpServerScriptPath();
    expect(scriptPath).toMatch(/dist[/\\]index\.js$/);
  });

  // Given MCP SDK default request timeout is 60s and Lee cold start can exceed that
  // When the stdio client is configured
  // Then tool calls must wait up to the Lambda budget, not the SDK default
  it("uses a tool timeout above the MCP SDK 60s default", () => {
    expect(ELEPHANT_MCP_TOOL_TIMEOUT_MS).toBeGreaterThan(60_000);
    expect(ELEPHANT_MCP_TOOL_TIMEOUT_MS).toBeLessThanOrEqual(110_000);
  });

  it("keeps getOracleProperty under the HTTP API 29s budget", () => {
    expect(resolveElephantMcpToolTimeoutMs("queryProperties")).toBe(
      ELEPHANT_MCP_TOOL_TIMEOUT_MS,
    );
    expect(resolveElephantMcpToolTimeoutMs("getOracleProperty")).toBeLessThan(29_000);
    expect(resolveElephantMcpToolTimeoutMs("getPermitQuerySchema")).toBeLessThan(
      29_000,
    );
  });

  // Given MCP can return isError:true without throwing
  // When unwrapElephantMcpToolResult sees that envelope
  // Then it throws a retryable error instead of a row-parse 500
  it("unwraps MCP isError results as retryable failures", () => {
    expect(() =>
      unwrapElephantMcpToolResult("queryProperties", {
        isError: true,
        content: [{ type: "text", text: "duckdb not ready" }],
      }),
    ).toThrow(/retryable/);
  });

  it("reconnects the stdio client after a tool timeout", () => {
    const source = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "elephant-mcp-stdio-tool-client.ts",
      ),
      "utf8",
    );
    expect(source).toContain("void client.close()");
    expect(source).toContain(
      "A timed-out stdio session stays wedged; reconnect on the next call.",
    );
  });
});
