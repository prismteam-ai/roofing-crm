import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getEnv } from "@/lib/config/env";
import { McpError } from "./types";
import type { BBox, McpAreaResult, McpDataSource, McpQueryResult, McpSchemaResult } from "./types";

/**
 * Elephant MCP client (streamable HTTP). This is the ONLY path through which the CRM
 * reads property, permit and contractor data - never parquet, IPFS or Neon directly.
 *
 * A single connected client is kept per process and transparently reconnected when
 * a call fails with a transport error.
 *
 * @module mcp/client
 */

interface ToolTextResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

let connected: Promise<Client> | null = null;

async function connect(): Promise<Client> {
  const env = getEnv();
  const client = new Client({ name: "roofing-crm", version: "0.1.0" });
  const headers: Record<string, string> = {};
  if (env.ORACLE_MCP_AUTH_TOKEN) headers.Authorization = `Bearer ${env.ORACLE_MCP_AUTH_TOKEN}`;
  const transport = new StreamableHTTPClientTransport(new URL(env.ORACLE_MCP_URL), {
    requestInit: { headers },
  });
  await client.connect(transport);
  return client;
}

function getClient(): Promise<Client> {
  if (!connected) {
    connected = connect().catch((err: unknown) => {
      connected = null;
      throw err;
    });
  }
  return connected;
}

function parseToolResult<T>(tool: string, result: ToolTextResult): T {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new McpError("Empty MCP response", tool);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new McpError(
      result.isError ? "MCP tool error" : "Non-JSON MCP response",
      tool,
      text.slice(0, 500),
    );
  }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const e = parsed as { error: string; details?: string };
    throw new McpError(e.error, tool, e.details);
  }
  if (result.isError) throw new McpError("MCP tool error", tool, text.slice(0, 500));
  return parsed as T;
}

/**
 * Call one MCP tool and parse its JSON text payload. Retries once on transport failure.
 */
export async function callMcpTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const attempt = async (): Promise<T> => {
    const client = await getClient();
    const result = (await client.callTool({ name: tool, arguments: args })) as ToolTextResult;
    return parseToolResult<T>(tool, result);
  };
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof McpError) throw err;
    // Transport problem: close the old client/transport, then reconnect once.
    const stale = connected;
    connected = null;
    if (stale) await stale.then((c) => c.close()).catch(() => undefined);
    try {
      return await attempt();
    } catch (err2) {
      if (err2 instanceof McpError) throw err2;
      throw new McpError(
        `Cannot reach the Elephant MCP server at ${getEnv().ORACLE_MCP_URL}`,
        tool,
        err2 instanceof Error ? err2.message : String(err2),
      );
    }
  }
}

/** Production `McpDataSource` bound to the configured county. */
export const mcp: McpDataSource = {
  getPropertySchema: () =>
    callMcpTool<McpSchemaResult>("getPropertyQuerySchema", { county: getEnv().ORACLE_MCP_COUNTY }),
  getPermitSchema: () =>
    callMcpTool<McpSchemaResult>("getPermitQuerySchema", { county: getEnv().ORACLE_MCP_COUNTY }),
  queryProperties: <Row>(sql: string, limit?: number) =>
    callMcpTool<McpQueryResult<Row>>("queryProperties", {
      county: getEnv().ORACLE_MCP_COUNTY,
      sql,
      ...(limit ? { limit } : {}),
    }),
  queryPermits: <Row>(sql: string, limit?: number) =>
    callMcpTool<McpQueryResult<Row>>("queryPermits", {
      county: getEnv().ORACLE_MCP_COUNTY,
      sql,
      ...(limit ? { limit } : {}),
    }),
  findPropertiesInArea: (bbox: BBox) =>
    callMcpTool<McpAreaResult>("findPropertiesInArea", {
      county: getEnv().ORACLE_MCP_COUNTY,
      bbox,
    }),
};
