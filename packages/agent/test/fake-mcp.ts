import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const FTL = { lat: 26.14123, lon: -80.14673 };
export const P1 = { parcel_identifier: "504202150320", address: "1515 NE 2 ST", lat: 26.1236, lon: -80.1268 };
export const P2 = { parcel_identifier: "504207080920", address: "3839 SW 6 ST", lat: 26.1145, lon: -80.1949 };

const permitRow = (p: typeof P1, n: string, years: number) => ({
  ...p,
  permit_key: `ftl:${n}`,
  permit_number: n,
  status: "open",
  open_days: Math.round(years * 365.25),
  open_years: years,
  contractor_name: "ACME ROOFING LLC",
  bbb_rating: null,
  source_url: `https://gis.fortlauderdale.gov/permit/${n}`,
  provenance: [{ source_url: `https://gis.fortlauderdale.gov/permit/${n}` }],
});

/** Answers like the Oracle's MCP tools (shape only), over a real Streamable HTTP MCP endpoint. */
export const handlers: Record<string, (a: any) => unknown> = {
  dataset_info: () => ({ manifestCid: "bafytest", asOf: "2026-11-27" }),
  resolve_place: (a) =>
    /fort lauderdale/i.test(a.name)
      ? { found: true, place: { name: "FORT LAUDERDALE", ...FTL } }
      : { found: false, place: null },
  find_open_roof_permits: (a) => {
    const rows = [permitRow(P1, "R-1", 8.1), permitRow(P2, "R-2", 6.2)].filter(
      (r) => r.open_years >= (a.minOpenYears ?? 0),
    );
    return {
      total_matching: rows.length,
      rows,
      notes: ["No BBB rating is published for these contractors."],
    };
  },
  find_aged_roofs: () => ({
    total_matching: 1,
    rows: [
      {
        ...P1,
        roof_age_years: 85,
        roof_age_basis: "year_built",
        provenance: [{ source_url: "https://bcpa.net/1" }],
      },
    ],
    notes: [],
  }),
  search_records: () => ({
    hits: [{ ...P1, text: "1515 NE 2 ST", source_url: "https://bcpa.net/1" }],
    notes: [],
  }),
  get_property: () => ({ property: { ...P1, source_url: "https://bcpa.net/1" }, permits: [] }),
  get_permit: () => ({ permit: permitRow(P1, "R-1", 8.1), property: P1 }),
  get_contractor: () => ({
    contractor: { contractor_name: "ACME ROOFING LLC", source_url: "https://dbpr" },
    permits: [],
  }),
  find_long_held_properties: () => ({ rows: [] }),
  find_out_of_area_owners: () => ({ rows: [] }),
  find_by_occupancy: () => ({ rows: [] }),
  run_read_only_sql: () => ({ rows: [] }),
};

const loose = { lat: z.number().optional(), lon: z.number().optional(), radiusMiles: z.number().optional() };
const schemas: Record<string, z.ZodRawShape> = {
  resolve_place: { name: z.string() },
  find_open_roof_permits: { ...loose, minOpenYears: z.number().optional() },
  find_aged_roofs: { ...loose, minRoofAgeYears: z.number().optional() },
  search_records: { query: z.string().optional(), ...loose },
  get_property: { id: z.string().optional() },
  get_permit: { id: z.string().optional() },
  get_contractor: { id: z.string().optional() },
};

export async function startFakeMcp(): Promise<{
  url: string;
  calls: string[];
  server: Server;
  close(): Promise<void>;
}> {
  const calls: string[] = [];
  const server = createServer(async (req, res) => {
    const mcp = new McpServer({ name: "fake-oracle", version: "0.0.0" });
    for (const [name, h] of Object.entries(handlers)) {
      mcp.registerTool(
        name,
        { description: name, inputSchema: schemas[name] ?? loose },
        async (args: any) => {
          calls.push(name);
          const out = h(args) as Record<string, unknown>;
          return { content: [{ type: "text" as const, text: JSON.stringify(out) }], structuredContent: out };
        },
      );
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => void transport.close());
    await mcp.connect(transport);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    server,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
