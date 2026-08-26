/**
 * Stdio Elephant MCP tool client for Lambda and local live-data paths.
 *
 * Spawns `@elephant-xyz/mcp` as a child process. Never falls back to DEMO stand-ins.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  FORBIDDEN_ELEPHANT_MCP_TOOLS,
  type ElephantMcpToolClient,
} from "@roofing-crm-challenge/elephant-client";
import { ELEPHANT_MCP_SERVER_ENV } from "./elephant-mcp-env.js";

/**
 * MCP SDK defaults to 60s; Lee DuckDB/IPFS cold start can exceed that while
 * Lambda still has budget (120s). Stay under the function timeout.
 */
export const ELEPHANT_MCP_TOOL_TIMEOUT_MS = 110_000;

/** HTTP API integration timeout is ~29s; keep non-search tools inside that budget. */
export const ELEPHANT_MCP_FAST_TOOL_TIMEOUT_MS = 12_000;

/**
 * Browser `search.inRadius` must return (or fail) before API Gateway's ~29s cap.
 * Leaving queryProperties running for 110s after a 503 holds Lambda concurrency
 * (this account's quota is 10) and makes leads.archive 503.
 */
export const ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS = 20_000;

/**
 * Per-invocation queryProperties budget. HTTP handlers set 20s; EventBridge warmup
 * keeps the full DuckDB cold-start budget.
 */
export const elephantMcpTimeoutStore = new AsyncLocalStorage<{
  queryPropertiesTimeoutMs: number;
}>();

/**
 * queryProperties may cold-start DuckDB/IPFS for up to ~110s (Lambda budget).
 * getOracleProperty / schema probes must fail faster so API Gateway is not 503'd.
 */
export function resolveElephantMcpToolTimeoutMs(toolName: string): number {
  if (toolName === "queryProperties") {
    return (
      elephantMcpTimeoutStore.getStore()?.queryPropertiesTimeoutMs ??
      ELEPHANT_MCP_TOOL_TIMEOUT_MS
    );
  }
  return ELEPHANT_MCP_FAST_TOOL_TIMEOUT_MS;
}

/**
 * MCP `callTool` can return `{ isError: true }` without throwing. Treat that
 * as retryable so search does not 500 on `queryProperties` row parsing.
 */
export function unwrapElephantMcpToolResult(
  toolName: string,
  result: unknown,
): unknown {
  if (
    result !== null &&
    typeof result === "object" &&
    (result as { isError?: unknown }).isError === true
  ) {
    throw new Error(
      `Elephant MCP tool ${toolName} failed (retryable): tool returned isError`,
    );
  }
  return result;
}

export interface CreateElephantMcpStdioToolClientOptions {
  /**
   * Override MCP server entry script (defaults to bundled @elephant-xyz/mcp dist).
   */
  serverScriptPath?: string;
  /**
   * Extra env merged over process.env for the MCP child (defaults to kit maps).
   */
  serverEnv?: Record<string, string>;
}

/**
 * Resolves the bundled elephant-mcp stdio server entrypoint.
 */
export function resolveBundledElephantMcpServerScriptPath(): string {
  const require = createRequire(import.meta.url);
  const elephantPackageJsonPath = require.resolve("@elephant-xyz/mcp/package.json");
  return join(dirname(elephantPackageJsonPath), "dist/index.js");
}

/**
 * Builds an ElephantMcpToolClient that talks to elephant-mcp over stdio.
 *
 * Connection is lazy: the child process starts on the first tool call.
 */
export function createElephantMcpStdioToolClient(
  options: CreateElephantMcpStdioToolClientOptions = {},
): ElephantMcpToolClient {
  let clientPromise: Promise<Client> | null = null;
  let connectError: Error | null = null;

  const serverScriptPath =
    options.serverScriptPath ?? resolveBundledElephantMcpServerScriptPath();
  const serverEnv: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...process.env,
      ...ELEPHANT_MCP_SERVER_ENV,
      ...options.serverEnv,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  async function connectClient(): Promise<Client> {
    if (connectError !== null) {
      throw connectError;
    }
    if (clientPromise === null) {
      clientPromise = (async () => {
        const transport = new StdioClientTransport({
          command: process.execPath,
          args: [serverScriptPath],
          env: serverEnv,
          stderr: "pipe",
        });
        const client = new Client(
          { name: "roofing-crm-api", version: "0.0.0" },
          { capabilities: {} },
        );
        await client.connect(transport);
        return client;
      })().catch((error: unknown) => {
        connectError =
          error instanceof Error
            ? error
            : new Error("Elephant MCP stdio connection failed");
        clientPromise = null;
        throw connectError;
      });
    }
    return clientPromise;
  }

  return {
    async callTool(
      toolName: string,
      arguments_: Record<string, unknown>,
    ): Promise<unknown> {
      if ((FORBIDDEN_ELEPHANT_MCP_TOOLS as readonly string[]).includes(toolName)) {
        throw new Error(
          `Forbidden Elephant MCP tool for this CRM boundary: ${toolName}`,
        );
      }

      const startedAtMs = Date.now();
      const client = await connectClient();
      try {
        const result = await client.callTool(
          {
            name: toolName,
            arguments: arguments_,
          },
          undefined,
          { timeout: resolveElephantMcpToolTimeoutMs(toolName) },
        );
        const toolPayload = unwrapElephantMcpToolResult(toolName, result);
        console.info(
          JSON.stringify({
            msg: "elephant-mcp.callTool.ok",
            toolName,
            durationMs: Date.now() - startedAtMs,
          }),
        );
        return toolPayload;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Elephant MCP tool call failed";
        console.error(
          JSON.stringify({
            msg: "elephant-mcp.callTool.failed",
            toolName,
            durationMs: Date.now() - startedAtMs,
            errorMessage: message,
          }),
        );
        // A timed-out stdio session stays wedged; reconnect on the next call.
        void client.close().catch(() => undefined);
        clientPromise = null;
        connectError = null;
        throw new Error(`Elephant MCP tool ${toolName} failed (retryable): ${message}`);
      }
    },
  };
}
