import { createMCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";

/** The Oracle MCP tools the agent may call: read-only lookups (no SQL tool). */
export const ORACLE_READ_TOOLS = [
  "dataset_info",
  "resolve_place",
  "find_aged_roofs",
  "find_open_roof_permits",
  "find_long_held_properties",
  "find_out_of_area_owners",
  "find_by_occupancy",
  "search_records",
  "get_property",
  "get_permit",
  "get_contractor",
] as const;

export class OracleMcpUnavailable extends Error {
  override name = "OracleMcpUnavailable";
}

/** AI SDK tools from the Oracle's Streamable HTTP MCP endpoint, restricted to ORACLE_READ_TOOLS. */
export async function loadOracleTools(opts: {
  url: string;
  timeoutMs?: number;
}): Promise<{ tools: ToolSet; close(): Promise<void> }> {
  let client: Awaited<ReturnType<typeof createMCPClient>>;
  try {
    client = await createMCPClient({
      transport: { type: "http", url: opts.url },
      initializationOptions: { timeout: opts.timeoutMs ?? 10_000 },
    });
  } catch (e) {
    throw new OracleMcpUnavailable(`Oracle MCP at ${opts.url} is unreachable: ${(e as Error).message}`);
  }
  try {
    const all = await client.tools();
    const allowed = new Set<string>(ORACLE_READ_TOOLS);
    const tools = Object.fromEntries(Object.entries(all).filter(([name]) => allowed.has(name))) as ToolSet;
    if (!tools.resolve_place || !tools.find_aged_roofs) {
      throw new OracleMcpUnavailable(`Oracle MCP at ${opts.url} does not offer the roofing tools`);
    }
    return { tools, close: () => client.close() };
  } catch (e) {
    await client.close().catch(() => {});
    throw e instanceof OracleMcpUnavailable ? e : new OracleMcpUnavailable((e as Error).message);
  }
}
