/**
 * Maps a radius-search property row into the Oracle property drawer contract.
 *
 * Used when consolidated `getOracleProperty` is too slow for API Gateway (29s)
 * but DuckDB `queryProperties` already returned the parcel.
 */
import type { SearchInRadiusPropertyRow } from "./routers/search.js";
import type { OraclePropertyRecord } from "./routers/properties.js";

/**
 * Builds a drawer record from a search row.
 *
 * Passes through permit/BBB flags from the query table; detail rows are resolved
 * later via consolidated fetch or synthetic fallback in properties.get.
 */
export function mapSearchPropertyRowToOraclePropertyRecord(
  propertyRow: SearchInRadiusPropertyRow,
): OraclePropertyRecord {
  return {
    propertyId: propertyRow.propertyId,
    parcelIdentifier: propertyRow.parcelIdentifier,
    addressStreet: propertyRow.addressStreet,
    addressCity: propertyRow.addressCity,
    addressZip: propertyRow.addressZip,
    latitude: propertyRow.latitude,
    longitude: propertyRow.longitude,
    builtYear: propertyRow.builtYear,
    builtYearSource: propertyRow.builtYearSource ?? null,
    hasPermits: propertyRow.hasPermits,
    permitCount: propertyRow.permitCount,
    hasBbbContractor: propertyRow.hasBbbContractor,
  };
}
