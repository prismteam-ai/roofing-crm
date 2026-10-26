# Roofing CRM MCP server

A local, on-demand [MCP](https://modelcontextprotocol.io) server (stdio) that exposes the same five query tools as the in-app agent. There is no Oracle-hosted backend: it runs on the user's machine and DuckDB reads the published Parquet **directly from an IPFS gateway** (httpfs range requests), so nothing is downloaded up front.

## Tools (the shared contract)

The tool names and parameters are defined once in [`../shared/tools.json`](../shared/tools.json) and used by the Worker (in-app agent), this server, and `test/smoke.mjs`, which fails if the server's schemas drift from that file. The in-app agent runs them in the browser against DuckDB-WASM; this server runs the same SQL (`queries.mjs`, a port of `src/lib/queries.ts`) against server-side DuckDB.

| Tool | Params | Returns |
|---|---|---|
| `agingRoofs` | `pin {lat,lon}`, `radiusMiles`, `minAgeYears`, optional `withoutOpenPermit` | `{total, shown, rows}`: properties with estimated roof age ≥ `minAgeYears`, oldest first |
| `openPermits` | `pin`, `radiusMiles`, `filter` = `roofing` \| `roofing_low` \| `all_open` | `{total, shown, rows}`: open permits, longest-open first |
| `permitCounts` | `pin`, `radiusMiles` | open permits by roofing confidence, e.g. `{"low":10,"none":164}` |
| `permitsForProperty` | `propertyKey` | `{total, rows}`: every permit on the property |
| `propertyByKey` | `propertyKey` | full property record or `null` |

List results return the total count plus the top 15 rows. Radius is capped at 25 miles. Bad arguments come back as MCP tool errors (`isError`), not crashes.

## Run

```bash
cd mcp && npm install
node server.mjs          # speaks MCP on stdin/stdout (logs go to stderr)
npm test                 # spawns the server as an MCP client and checks the contract + live answers
```

## Data source

By default it reads the CIDs pinned in [`../shared/data-cids.json`](../shared/data-cids.json) (copied from the pipeline's `docs/ipfs/manifest-ipfs-20261026T032236Z.json`, artifacts `crm_properties` and `crm_permits`) through `https://ipfs.filebase.io`. Override with environment variables:

| Variable | Effect |
|---|---|
| `IPFS_GATEWAY` | Gateway base URL. `ipfs.io` and `dweb.link` return HTTP 429 for this workload; `ipfs.filebase.io` (where the data is pinned) works. |
| `PROPERTIES_CID`, `PERMITS_CID` | Use a newer pipeline run without editing files |
| `PARQUET_DIR` | Read `properties.parquet` and `permits.parquet` from a local folder (offline use) |

When the pipeline publishes a new run, update `shared/data-cids.json`; the web app and this server both pick it up.

## Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "roofing-crm": {
      "command": "node",
      "args": ["/absolute/path/to/roofing-crm/mcp/server.mjs"]
    }
  }
}
```

Claude Code: `claude mcp add roofing-crm -- node /absolute/path/to/roofing-crm/mcp/server.mjs`

Try: "Find roofs older than 20 years within 2 miles of 40.7684, -73.5251 that have no open permit."
