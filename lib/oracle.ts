/**
 * The CRM's only source of property and permit data: the Miami-Dade Oracle
 * pipeline's MCP endpoint. The CRM ingests nothing and stores no copy of the
 * dataset; it calls the pipeline's tools and shows what they return, together
 * with the evidence (SQL and snapshot ID) each call carries.
 */
export const ORACLE_URL = (process.env.ORACLE_URL ?? "https://pkvjvwftv5xgocgck3akhh4qmq0ufdpe.lambda-url.us-east-2.on.aws").replace(/\/$/, "");
export const ORACLE_MCP_URL = `${ORACLE_URL}/api/mcp`;

export interface Evidence {
  sql: string | string[];
  snapshot: { id: string; root_cid: string; manifest_cid: string };
}

export type Row = Record<string, string | number | boolean | null>;

export interface PropertySearch {
  total_matching_properties: number;
  distinct_street_addresses: number;
  roof_year_basis_counts: { roof_permit: number; year_built: number; unknown: number };
  shown: number;
  properties: Row[];
  evidence: Evidence;
}
export interface PermitSearch {
  total_matches: number;
  shown: number;
  permits: Row[];
  evidence: Evidence;
}
export interface PropertyDetail {
  property: Row | null;
  permits: Row[];
  evidence: Evidence;
}

let nextId = 1;

/** Call one tool on the Oracle MCP server (JSON-RPC over Streamable HTTP). */
export async function callOracle<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const response = await fetch(ORACLE_MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name: tool, arguments: args } }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`The data service returned HTTP ${response.status}`);
  const text = await response.text();
  // The server answers either as plain JSON or as a single server-sent event.
  const payload = text.trimStart().startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data:")) ?? "").slice(5);
  const message = JSON.parse(payload);
  if (message.error) throw new Error(message.error.message ?? "The data service rejected the request");
  const content = message.result?.content?.[0]?.text ?? "";
  if (message.result?.isError) throw new Error(content || "The data service could not answer");
  return JSON.parse(content) as T;
}
