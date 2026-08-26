/**
 * Published-county catalog shapes from Elephant MCP `listPublishedCounties`.
 *
 * Parses the catalog response into CRM entries. A property dataset is available
 * when `queryTableUrl` is present — that is the gate for product default, not
 * a side-channel `getOracleDatasetInfo` hit for an unlisted county.
 */
import { z } from "zod";

const publishedCountyCatalogCountySchema = z.object({
  countyKey: z.string().min(1),
  countyName: z.string().optional(),
  stateCode: z.string().min(1),
  status: z.string().optional(),
  queryTableUrl: z.string().nullable().optional(),
  datasetCoverageUrl: z.string().nullable().optional(),
  permitQueryTableUrl: z.string().nullable().optional(),
  placesTableUrl: z.string().nullable().optional(),
  updatedAt: z.string().optional(),
});

const publishedCountyCatalogResponseSchema = z.object({
  counties: z.array(publishedCountyCatalogCountySchema),
});

/** One county row after CRM normalization from the live catalog tool. */
export interface PublishedCountyCatalogEntry {
  countyKey: string;
  stateCode: string;
  /** Display name from the catalog (`Lee`), not a UI heading. */
  countyName: string;
  /** True when the catalog row exposes a non-empty property query table URL. */
  propertyDatasetAvailable: boolean;
  /**
   * True when radius search may use the official published property table.
   *
   * Overlay-only picker rows may expose a local query table while remaining
   * false so defaultCounty and search.inRadius stay honest.
   */
  mapSearchReady: boolean;
}

/**
 * Resolves a human county name from a catalog row.
 *
 * Prefers the catalog `countyName`. Falls back to hyphen-split title case of
 * the key so a missing name cannot invent a different county.
 */
export function resolvePublishedCountyCatalogName(
  countyKey: string,
  countyName: string | undefined,
): string {
  const trimmedCountyName = countyName?.trim();
  if (trimmedCountyName !== undefined && trimmedCountyName.length > 0) {
    return trimmedCountyName;
  }
  return countyKey
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join("-");
}

/**
 * Parses a raw `listPublishedCounties` payload into PublishedCountyCatalogEntry rows.
 *
 * Drops nothing that the catalog listed; derives `propertyDatasetAvailable` from
 * `queryTableUrl` so unpublished side channels cannot invent availability.
 */
export function parsePublishedCountyCatalog(
  raw: unknown,
): PublishedCountyCatalogEntry[] {
  const parsed = publishedCountyCatalogResponseSchema.parse(raw);
  return parsed.counties.map((county) => {
    const countyKey = county.countyKey.trim().toLowerCase();
    const propertyDatasetAvailable =
      typeof county.queryTableUrl === "string" &&
      county.queryTableUrl.trim().length > 0;
    return {
      countyKey,
      stateCode: county.stateCode,
      countyName: resolvePublishedCountyCatalogName(countyKey, county.countyName),
      propertyDatasetAvailable,
      mapSearchReady: propertyDatasetAvailable,
    };
  });
}

/**
 * Loads and parses the published-county catalog via an injectable transport.
 *
 * Callers (API Lambda) supply the MCP/HTTP fetch; tests pass a fixed payload.
 * Do not invent counties outside the returned catalog.
 */
export async function listPublishedCounties(
  loadCatalog: () => Promise<unknown>,
): Promise<PublishedCountyCatalogEntry[]> {
  return parsePublishedCountyCatalog(await loadCatalog());
}
