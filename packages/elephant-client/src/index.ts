/**
 * Server-side Elephant MCP consume boundary for the map CRM.
 *
 * Use this package only from `apps/api` (Lambda). It types published property
 * rows and will wrap MCP tool calls. Do not import from the browser.
 *
 * Lee property view: 37 columns; `gis_muni` is absent — do not clip Lee with
 * Chester MUNI codes. Do not call `getPropertyPermits` (harvest-adjacent);
 * use schema probe then `permits[]` on the property payload when needed.
 */

export {
  mapPublishedPropertyRowToSearchFields,
  parsePublishedPropertyRow,
  publishedPropertyRowSchema,
  type PublishedPropertyRow,
} from "./published-property-row.js";

export {
  listPublishedCounties,
  parsePublishedCountyCatalog,
  resolvePublishedCountyCatalogName,
  type PublishedCountyCatalogEntry,
} from "./published-county-catalog.js";

export {
  mergeQueryTableServedCountiesIntoCatalog,
  parsePropertyQueryTableMapKeys,
  QUERY_TABLE_SERVED_COUNTY_OVERLAYS,
} from "./merge-query-table-served-counties.js";

export {
  parseElephantMcpToolJson,
  parseQueryPropertiesRows,
  type ElephantMcpToolClient,
} from "./elephant-mcp-tool-client.js";

/**
 * MCP tools this CRM must never invoke from the elephant-client boundary.
 *
 * `getPropertyPermits` can enqueue harvest. Places/colocation tools are outside
 * the lead workflow. Keep the allowlist to catalog, query, and property get.
 */
export const FORBIDDEN_ELEPHANT_MCP_TOOLS = ["getPropertyPermits"] as const;

/**
 * Documents that Lee's published properties view has no municipality clip key.
 *
 * Chester may later clip by city or a future `gis_muni`; Lee must not invent one.
 */
export const LEE_PUBLISHED_PROPERTY_VIEW_HAS_GIS_MUNI = false;
