/**
 * Loads bbox property rows via Elephant MCP `queryProperties`.
 *
 * Intended for local tRPC (and later Lambda) when ROOFING_CRM_ELEPHANT_MCP=1.
 * Does not call `getPropertyPermits`.
 */
import {
  mapPublishedPropertyRowToSearchFields,
  parseQueryPropertiesRows,
  publishedPropertyRowSchema,
  type ElephantMcpToolClient,
} from "@roofing-crm-challenge/elephant-client";
import type {
  SearchInRadiusBoundingBox,
  SearchInRadiusCenter,
  SearchInRadiusPropertyRow,
} from "./routers/search.js";

const SEARCH_PROPERTY_SELECT_SQL =
  "SELECT property_id, parcel_identifier, latitude, longitude, TRY_CAST(built_year AS INTEGER) AS built_year, address_street, address_city, address_zip, has_permits, permit_count, has_bbb_contractor FROM properties";

/**
 * Published Chester (real) query table is narrow: request_identifier,
 * property_cid, latitude, longitude only. The parcel UPI (request_identifier)
 * is the property identity; addresses and roof ages are not published.
 */
const SEARCH_PROPERTY_SELECT_SQL_CHESTER_REAL =
  "SELECT request_identifier AS property_id, request_identifier AS parcel_identifier, latitude, longitude, NULL AS built_year, NULL AS built_year_source, NULL AS address_street, NULL AS address_city, NULL AS address_zip, NULL AS has_permits, NULL AS permit_count, NULL AS has_bbb_contractor FROM properties";

/**
 * Published Chester (demo) query table adds labeled synthetic roof-age fields
 * (built_year, built_year_source) plus roofing-permit and BBB flags. It still
 * publishes no addresses — never invent them.
 */
const SEARCH_PROPERTY_SELECT_SQL_CHESTER_DEMO =
  "SELECT request_identifier AS property_id, request_identifier AS parcel_identifier, latitude, longitude, TRY_CAST(built_year AS INTEGER) AS built_year, built_year_source, NULL AS address_street, NULL AS address_city, NULL AS address_zip, has_roofing_permit AS has_permits, NULL AS permit_count, has_bbb_contractor FROM properties";

/**
 * Dataset-aware property SELECT — Chester tables use the published narrow
 * schema (request_identifier identity, no addresses); other counties keep the
 * standard 11-column view.
 */
export function resolveSearchPropertySelectSql(county: string): string {
  const normalizedCounty = county.trim().toLowerCase();
  if (normalizedCounty === "chester-demo") {
    return SEARCH_PROPERTY_SELECT_SQL_CHESTER_DEMO;
  }
  if (normalizedCounty === "chester") {
    return SEARCH_PROPERTY_SELECT_SQL_CHESTER_REAL;
  }
  return SEARCH_PROPERTY_SELECT_SQL;
}

/** MCP `queryProperties` row cap for radius bbox scans (nearest-first). */
export const SEARCH_PROPERTY_BBOX_QUERY_LIMIT = 1000;

/**
 * Equirectangular squared-distance ORDER BY for nearest-first bbox scans.
 *
 * Uses squared degree deltas (no sqrt) — ordering matches true distance.
 */
export function buildNearestFirstBoundingBoxOrderBySql(center: {
  lat: number;
  lng: number;
}): string {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const latLiteral = String(center.lat);
  const lngLiteral = String(center.lng);
  const cosLatLiteral = String(cosLat);
  return [
    "ORDER BY",
    `((${latLiteral} - latitude) * (${latLiteral} - latitude)`,
    `+ ((${lngLiteral} - longitude) * ${cosLatLiteral}) * ((${lngLiteral} - longitude) * ${cosLatLiteral})) ASC`,
  ].join(" ");
}

function mapRawQueryRowToSearchPropertyRow(
  rawRow: unknown,
): SearchInRadiusPropertyRow | null {
  const parsedPublishedPropertyRow = publishedPropertyRowSchema.safeParse(
    fillPublishedPropertyRowForSearch(rawRow),
  );
  if (!parsedPublishedPropertyRow.success) {
    return null;
  }
  return mapPublishedPropertyRowToSearchFields(parsedPublishedPropertyRow.data);
}

function parseSearchPropertyRows(rawQueryResult: unknown): SearchInRadiusPropertyRow[] {
  const searchPropertyRows: SearchInRadiusPropertyRow[] = [];
  for (const rawRow of parseQueryPropertiesRows(rawQueryResult)) {
    const searchFields = mapRawQueryRowToSearchPropertyRow(rawRow);
    if (searchFields !== null) {
      searchPropertyRows.push(searchFields);
    }
  }
  return searchPropertyRows;
}

/**
 * Builds a bbox `queryProperties` loader over an Elephant MCP tool client.
 */
export function createQueryPropertiesInBoundingBoxLoader(
  elephantMcpToolClient: ElephantMcpToolClient,
): (arguments_: {
  county: string;
  boundingBox: SearchInRadiusBoundingBox;
  center: SearchInRadiusCenter;
}) => Promise<SearchInRadiusPropertyRow[]> {
  return async (arguments_) => {
    const { boundingBox, center, county } = arguments_;
    const sql = [
      resolveSearchPropertySelectSql(county),
      "WHERE latitude IS NOT NULL AND longitude IS NOT NULL",
      `AND latitude BETWEEN ${String(boundingBox.minLat)} AND ${String(boundingBox.maxLat)}`,
      `AND longitude BETWEEN ${String(boundingBox.minLng)} AND ${String(boundingBox.maxLng)}`,
      buildNearestFirstBoundingBoxOrderBySql(center),
    ].join(" ");

    const rawQueryResult = await elephantMcpToolClient.callTool("queryProperties", {
      county,
      sql,
      limit: SEARCH_PROPERTY_BBOX_QUERY_LIMIT,
    });

    return parseSearchPropertyRows(rawQueryResult);
  };
}

/**
 * Escapes a property id for a single-quoted DuckDB string literal.
 */
export function escapeDuckDbStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

/**
 * Physical column holding the property identity for WHERE clauses.
 *
 * Chester tables publish request_identifier (aliased to property_id in the
 * SELECT); filtering must hit the physical column, not the alias.
 */
export function resolveSearchPropertyIdColumn(county: string): string {
  const normalizedCounty = county.trim().toLowerCase();
  return normalizedCounty === "chester" || normalizedCounty === "chester-demo"
    ? "request_identifier"
    : "property_id";
}

/**
 * Loads one published parcel via `queryProperties` (warm DuckDB) instead of
 * hanging `getOracleProperty` IPFS JSON.
 */
export function createQueryPropertyRowByIdLoader(
  elephantMcpToolClient: ElephantMcpToolClient,
): (arguments_: {
  county: string;
  propertyId: string;
}) => Promise<SearchInRadiusPropertyRow | null> {
  return async (arguments_) => {
    const { county, propertyId } = arguments_;
    const sql = [
      resolveSearchPropertySelectSql(county),
      `WHERE ${resolveSearchPropertyIdColumn(county)} = '${escapeDuckDbStringLiteral(propertyId)}'`,
      "LIMIT 1",
    ].join(" ");

    const rawQueryResult = await elephantMcpToolClient.callTool("queryProperties", {
      county,
      sql,
      limit: 1,
    });

    return parseSearchPropertyRows(rawQueryResult)[0] ?? null;
  };
}

/**
 * Pads a search SELECT (subset of 37 columns) so publishedPropertyRowSchema can run.
 *
 * Search only needs centroid + address + built_year; other view columns stay null.
 */
function fillPublishedPropertyRowForSearch(rawRow: unknown): unknown {
  if (rawRow === null || typeof rawRow !== "object") {
    return rawRow;
  }
  const row = rawRow as Record<string, unknown>;
  return {
    property_cid: null,
    request_identifier: null,
    source_system: null,
    county_name: null,
    state_code: null,
    address_zip: null,
    lot_size_acre: null,
    lot_area_sqft: null,
    exterior_wall_material: null,
    roof_covering_material: null,
    property_type: null,
    property_usage_type: null,
    built_year_source: null,
    livable_floor_area: null,
    total_area: null,
    assessed_value: null,
    market_value: null,
    land_value: null,
    avm_value: null,
    owner_name: null,
    owners_text: null,
    owner_count: null,
    owner_occupied: null,
    last_sale_date: null,
    last_sale_price: null,
    subdivision: null,
    has_permits: null,
    permit_count: null,
    has_sunbiz_tenant: null,
    has_bbb_contractor: null,
    hoa_flag: null,
    ...row,
  };
}
