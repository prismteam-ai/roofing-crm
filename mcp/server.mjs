#!/usr/bin/env node
// MCP server (stdio) exposing the roofing CRM's five query tools. Same names and params as the in-app agent
// (shared/tools.json); backed by server-side DuckDB reading the published Parquet straight from an IPFS gateway.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { handlers, openDb, tools } from "./queries.mjs";

const server = new Server({ name: "roofing-crm", version: "0.1.0" }, { capabilities: { tools: {} } });

let connPromise; // opened lazily so `tools/list` answers instantly
function db() {
  if (!connPromise) {
    const p = openDb();
    // Same reasoning as the browser's getConn(): don't let one failed connect poison every later call.
    p.catch(() => { if (connPromise === p) connPromise = undefined; });
    connPromise = p;
  }
  return connPromise;
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const handler = handlers[name];
  if (!handler) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  try {
    const result = await handler(await db(), args ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Error: ${e?.message ?? e}` }] };
  }
});

await server.connect(new StdioServerTransport()); // stdout is the protocol channel: log to stderr only
console.error("roofing-crm MCP ready");
