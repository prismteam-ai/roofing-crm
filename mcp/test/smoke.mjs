// Spawns the server over stdio like a real MCP client and checks the contract + live answers.
// Needs network (reads Parquet from the IPFS gateway) unless PARQUET_DIR is set.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tools } from "../queries.mjs";

const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["server.mjs"], env: { ...process.env } }));

const listed = (await client.listTools()).tools;
assert.deepEqual(listed.map((t) => t.name), tools.map((t) => t.name), "tool names match shared/tools.json");
assert.deepEqual(listed.map((t) => t.inputSchema), tools.map((t) => t.input_schema), "schemas match shared/tools.json");

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, data: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) };
};
const pin = { lat: 40.7684, lon: -73.5251 };

const counts = await call("permitCounts", { pin, radiusMiles: 3 });
assert.equal(Object.values(counts.data).reduce((a, b) => a + b, 0), 174, "matches the browser app: 174 open permits within 3 mi of Hicksville (run ipfs-20261026T032236Z)");

const roofs = await call("agingRoofs", { pin, radiusMiles: 1, minAgeYears: 15 });
const roofsNoPermit = await call("agingRoofs", { pin, radiusMiles: 1, minAgeYears: 15, withoutOpenPermit: true });
assert.equal(roofs.data.total, 5892, "matches the browser app: 5,892 roofs >= 15 yrs within 1 mi of Hicksville");
assert.ok(roofsNoPermit.data.total <= roofs.data.total);

const first = roofs.data.rows[0].property_key;
assert.equal((await call("propertyByKey", { propertyKey: first })).data.property_key, first);
assert.ok(Array.isArray((await call("permitsForProperty", { propertyKey: first })).data.rows));
assert.ok((await call("openPermits", { pin, radiusMiles: 3, filter: "roofing_low" })).data.total >= 0);

assert.equal((await call("agingRoofs", { pin: { lat: "x" }, radiusMiles: 1, minAgeYears: 15 })).isError, true, "bad args are tool errors, not crashes");
assert.equal((await call("nope", {})).isError, true);

await client.close();
console.log("MCP smoke test passed");
