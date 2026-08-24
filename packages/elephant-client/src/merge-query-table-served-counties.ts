/**
 * Overlays counties this CRM can actually query via PROPERTY_QUERY_TABLE_MAP
 * onto the Oracle listPublishedCounties snapshot.
 *
 * Oracle's catalog is unchanged. Search GIS MUNI clipping must keep using the
 * official catalog — Chester's published view has no gis_muni, so treating an
 * overlay row as "catalog-published" for MUNI clip would drop every parcel.
 *
 * Overlays with both a property query table and a geo index are mapSearchReady
 * so the CRM can default to Chester without waiting for Oracle catalog admission.
 */
import type { PublishedCountyCatalogEntry } from "./published-county-catalog.js";

/**
 * Counties this repo may add to the CRM picker when the query-table map
 * serves them. Identity is local consume metadata, not an Oracle catalog row.
 *
 * Labels: Chester (real) vs Chester (demo data) — never share a key.
 */
export const QUERY_TABLE_SERVED_COUNTY_OVERLAYS: Record<
  string,
  { countyName: string; stateCode: string }
> = {
  chester: { countyName: "Chester (real)", stateCode: "PA" },
  "chester-demo": { countyName: "Chester (demo data)", stateCode: "PA" },
  montgomery: { countyName: "Montgomery", stateCode: "PA" },
};

/**
 * Reads county keys from a PROPERTY_QUERY_TABLE_MAP (or geo-index map) JSON object.
 *
 * Invalid JSON yields no keys so a bad env cannot invent counties.
 */
export function parsePropertyQueryTableMapKeys(
  propertyQueryTableMapJson: string,
): string[] {
  try {
    const parsed: unknown = JSON.parse(propertyQueryTableMapJson);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [];
    }
    return Object.keys(parsed as Record<string, unknown>).map((key) =>
      key.trim().toLowerCase(),
    );
  } catch {
    return [];
  }
}

/**
 * Appends or upgrades overlay counties that the query-table map serves.
 *
 * Does not remove Oracle catalog rows. Does not overlay keys outside
 * QUERY_TABLE_SERVED_COUNTY_OVERLAYS (for example santa-clara).
 *
 * When `oracleGeoIndexIpnsMapJson` lists the same county key, the overlay is
 * `mapSearchReady: true` (property + geo capability validated). Missing geo
 * keeps the county listable but not searchable as the CRM default.
 */
export function mergeQueryTableServedCountiesIntoCatalog(
  catalogEntries: PublishedCountyCatalogEntry[],
  propertyQueryTableMapJson: string,
  oracleGeoIndexIpnsMapJson = "{}",
): PublishedCountyCatalogEntry[] {
  const servedKeys = new Set(parsePropertyQueryTableMapKeys(propertyQueryTableMapJson));
  const geoReadyKeys = new Set(
    parsePropertyQueryTableMapKeys(oracleGeoIndexIpnsMapJson),
  );
  const merged = catalogEntries.map((entry) => ({ ...entry }));

  for (const [countyKey, identity] of Object.entries(
    QUERY_TABLE_SERVED_COUNTY_OVERLAYS,
  )) {
    if (!servedKeys.has(countyKey)) {
      continue;
    }
    const mapSearchReady = geoReadyKeys.has(countyKey);
    const servedEntry: PublishedCountyCatalogEntry = {
      countyKey,
      countyName: identity.countyName,
      stateCode: identity.stateCode,
      propertyDatasetAvailable: true,
      mapSearchReady,
    };
    const existingIndex = merged.findIndex(
      (entry) => entry.countyKey.trim().toLowerCase() === countyKey,
    );
    if (existingIndex === -1) {
      merged.push(servedEntry);
      continue;
    }
    const existing = merged[existingIndex];
    if (existing === undefined) {
      continue;
    }
    // Always refresh overlay identity labels; upgrade mapSearchReady when geo is present.
    merged[existingIndex] = {
      ...existing,
      countyName: identity.countyName,
      stateCode: identity.stateCode,
      propertyDatasetAvailable: true,
      mapSearchReady: existing.mapSearchReady || mapSearchReady,
    };
  }

  return merged;
}
