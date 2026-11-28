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

/** Rows of one tool result the model sees; the full result stays in the step (UI evidence). */
export const MODEL_ROW_LIMIT = 40;
/** Per-row fields the model does not need to answer: provenance, URLs, content ids. */
const MODEL_DROP_KEYS = new Set([
  "provenance",
  "source_url",
  "source_system",
  "retrieved_at",
  "manifest_cid",
  "property_cid",
  "property_improvement_cid",
  "contractor_company_cid",
  "company_cid",
]);

function compactValue(v: unknown, depth: number): unknown {
  if (Array.isArray(v)) return v.map((x) => compactValue(x, depth + 1));
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    // Keep the top-level manifest id once; drop it (and the other ids/URLs) inside every row.
    if (x === null || (depth > 0 && MODEL_DROP_KEYS.has(k)) || (depth === 0 && k === "provenance")) continue;
    out[k] = compactValue(x, depth + 1);
  }
  return out;
}

/**
 * What the model reads from an Oracle MCP result: rows without provenance, URLs, ids or nulls,
 * at most MODEL_ROW_LIMIT of them, with the true totals kept. One 174-row answer otherwise cost
 * ~240k tokens across the agent's steps; the citations and map pins still use the full result.
 */
export function compactForModel(output: unknown): string {
  const content = (output as { content?: { type: string; text?: string }[] } | null)?.content;
  const texts = Array.isArray(content)
    ? content.filter((c) => c.type === "text").map((c) => c.text ?? "")
    : [];
  if (!texts.length) return JSON.stringify(output);
  return texts
    .map((t) => {
      let j: unknown;
      try {
        j = JSON.parse(t);
      } catch {
        return t;
      }
      const c = compactValue(j, 0) as Record<string, unknown>;
      if (c && Array.isArray(c.rows) && c.rows.length > MODEL_ROW_LIMIT) {
        const shown = c.rows.length;
        c.rows = c.rows.slice(0, MODEL_ROW_LIMIT);
        c.rows_note = `Showing ${MODEL_ROW_LIMIT} of the ${shown} rows returned (total_matching and count cover all of them). The user sees every row on the map.`;
      }
      return JSON.stringify(c);
    })
    .join("\n");
}

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
    const tools = Object.fromEntries(
      Object.entries(all)
        .filter(([name]) => allowed.has(name))
        .map(([name, t]) => [
          name,
          {
            ...t,
            toModelOutput: ({ output }: { output: unknown }) => ({
              type: "text",
              value: compactForModel(output),
            }),
          },
        ]),
    ) as ToolSet;
    if (!tools.resolve_place || !tools.find_aged_roofs) {
      throw new OracleMcpUnavailable(`Oracle MCP at ${opts.url} does not offer the roofing tools`);
    }
    return { tools, close: () => client.close() };
  } catch (e) {
    await client.close().catch(() => {});
    throw e instanceof OracleMcpUnavailable ? e : new OracleMcpUnavailable((e as Error).message);
  }
}
