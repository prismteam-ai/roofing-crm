// Single place to choose where data comes from. Swap local -> IPFS by changing `dataSource`
// (or setting VITE_DATA_SOURCE=ipfs at build time).

import published from "../shared/data-cids.json"; // same CIDs the MCP server reads

export type TableName = "properties" | "permits";

export type DataSource =
  | { kind: "local"; basePath: string }
  | { kind: "ipfs"; gateway: string; cids: Record<TableName, string> };

const local: DataSource = { kind: "local", basePath: "/data" };

const ipfs: DataSource = { kind: "ipfs", gateway: published.gateway, cids: published.cids };

export const dataSource: DataSource = import.meta.env.VITE_DATA_SOURCE === "ipfs" ? ipfs : local;

export const appConfig = {
  county: { name: "Nassau County, NY", center: [-73.5251, 40.7684] as [number, number], zoom: 12 }, // Hicksville: where the permit data is concentrated
  defaults: { roofAgeYears: 15, radiusMiles: 1 },
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

/** URL of the Parquet file for a table; the only place data URLs are built. */
export function tableUrl(table: TableName): string {
  if (dataSource.kind === "local") return `${dataSource.basePath}/${table}.parquet`;
  return `${dataSource.gateway}/ipfs/${dataSource.cids[table]}`;
}

/** Cloudflare Worker relay for the agent. In dev, Vite proxies /api to `wrangler dev` (see vite.config.ts). */
export const agentUrl: string = import.meta.env.VITE_AGENT_URL ?? "/api/agent";
