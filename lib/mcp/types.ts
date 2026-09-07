/**
 * Types for the Elephant MCP data boundary.
 *
 * @module mcp/types
 */

/** Result envelope returned by `queryProperties` / `queryPermits`. */
export interface McpQueryResult<Row = Record<string, unknown>> {
  county: string;
  rowCount: number;
  limit: number;
  rows: Row[];
}

/** One column of a query view as reported by `get*QuerySchema`. */
export interface McpColumn {
  name: string;
  type: string;
  description: string;
}

/** Result of `getPropertyQuerySchema` / `getPermitQuerySchema`. */
export interface McpSchemaResult {
  county: string;
  view: string;
  columnCount: number;
  columns: McpColumn[];
}

/** One hit from `findPropertiesInArea`. */
export interface McpAreaParcel {
  parcelIdentifier: string | null;
  requestIdentifier: string | null;
  latitude: number;
  longitude: number;
  currentAvmValue: number | null;
  propertyType: string | null;
}

/** Result of `findPropertiesInArea`. */
export interface McpAreaResult {
  count: number;
  parcels: McpAreaParcel[];
}

/** WGS84 bounding box. */
export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Minimal interface the rest of the app depends on. The production implementation
 * talks to the MCP server; tests inject a fake.
 */
export interface McpDataSource {
  getPropertySchema(): Promise<McpSchemaResult>;
  getPermitSchema(): Promise<McpSchemaResult>;
  queryProperties<Row = Record<string, unknown>>(
    sql: string,
    limit?: number,
  ): Promise<McpQueryResult<Row>>;
  queryPermits<Row = Record<string, unknown>>(
    sql: string,
    limit?: number,
  ): Promise<McpQueryResult<Row>>;
  findPropertiesInArea(bbox: BBox): Promise<McpAreaResult>;
}

/** Error raised when the MCP server rejects or fails a call. */
export class McpError extends Error {
  constructor(
    message: string,
    readonly tool: string,
    readonly details?: string,
  ) {
    super(details ? `${message}: ${details}` : message);
    this.name = "McpError";
  }
}
