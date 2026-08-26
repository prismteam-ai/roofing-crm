/**
 * Published-county catalog rows for the territory heading picker.
 *
 * Mirrors counties.list. The picker never invents keys outside this list.
 */

/**
 * One county the operator can switch the map onto.
 */
export interface PublishedCountyCatalogListItem {
  countyKey: string;
  countyName: string;
  stateCode: string;
  propertyDatasetAvailable: boolean;
  /**
   * True when radius search may use the official published property table.
   *
   * Overlay picker rows may expose a local query table while remaining false.
   */
  mapSearchReady: boolean;
}

/**
 * Lee-only catalog when counties.list is unreachable (local Vite without tRPC).
 */
export const LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST: PublishedCountyCatalogListItem[] =
  [
    {
      countyKey: "lee",
      countyName: "Lee",
      stateCode: "FL",
      propertyDatasetAvailable: true,
      mapSearchReady: true,
    },
  ];

/**
 * Resolves the SPA county key when defaultCounty may name an overlay-only row.
 *
 * Honors mapSearchReady so overlay Chester never becomes the live search county
 * on first paint. Falls back to the first map-ready catalog row.
 */
export function resolveDefaultCountyKeyFromCatalog(
  defaultCountyKey: string,
  publishedCountyCatalogListItems: PublishedCountyCatalogListItem[],
): string {
  const defaultCatalogItem = publishedCountyCatalogListItems.find(
    (item) => item.countyKey === defaultCountyKey,
  );
  if (defaultCatalogItem?.mapSearchReady === true) {
    return defaultCountyKey;
  }
  const firstMapSearchReadyItem = publishedCountyCatalogListItems.find(
    (item) => item.mapSearchReady,
  );
  return firstMapSearchReadyItem?.countyKey ?? defaultCountyKey;
}

/**
 * Keeps a listed catalog county selected, including overlay-only rows.
 *
 * Unknown keys fall back to the first map-ready row so a stale default cannot
 * name a county the picker does not have.
 */
export function resolveMapSearchReadyCountyKeyFallback(
  selectedCountyKey: string,
  publishedCountyCatalogListItems: PublishedCountyCatalogListItem[],
): string {
  const selectedItem = publishedCountyCatalogListItems.find(
    (item) => item.countyKey === selectedCountyKey,
  );
  if (selectedItem !== undefined) {
    return selectedCountyKey;
  }
  const firstMapSearchReadyItem = publishedCountyCatalogListItems.find(
    (item) => item.mapSearchReady,
  );
  return firstMapSearchReadyItem?.countyKey ?? selectedCountyKey;
}

/**
 * Builds the territory heading from a catalog row.
 *
 * Chester keys use short labels (real vs demo). Other keys use
 * `{countyName} County, {state}`.
 */
export function formatTerritoryCountyHeading(
  item: PublishedCountyCatalogListItem,
): string {
  if (item.countyKey === "chester-demo") {
    return "Chester (demo data)";
  }
  if (item.countyKey === "chester") {
    return "Chester (real)";
  }
  return `${item.countyName} County, ${item.stateCode}`;
}

/**
 * Filters searchable catalog counties by heading, key, name, or state.
 *
 * Rows without a property table are omitted — search cannot run on them.
 * Chester demo is listed before Chester real when both are present.
 */
export function filterPublishedCountyCatalogListItems(
  items: PublishedCountyCatalogListItem[],
  query: string,
): PublishedCountyCatalogListItem[] {
  const searchableItems = items.filter((item) => item.propertyDatasetAvailable);
  const needle = query.trim().toLowerCase();
  const matched =
    needle.length === 0
      ? searchableItems
      : searchableItems.filter((item) => {
          const heading = formatTerritoryCountyHeading(item).toLowerCase();
          return (
            heading.includes(needle) ||
            item.countyKey.includes(needle) ||
            item.countyName.toLowerCase().includes(needle) ||
            item.stateCode.toLowerCase().includes(needle)
          );
        });
  // Float the two Chester entries (demo first) and keep the served catalog
  // order for every other county — Array.prototype.sort is stable.
  const chesterCatalogRank = (countyKey: string): number => {
    if (countyKey === "chester-demo") {
      return 0;
    }
    if (countyKey === "chester") {
      return 1;
    }
    return 2;
  };
  return [...matched].sort(
    (left, right) =>
      chesterCatalogRank(left.countyKey) - chesterCatalogRank(right.countyKey),
  );
}

/**
 * Resolves coverage honesty for the selected catalog county.
 *
 * Overlay-only Chester and Montgomery rows omit published-pilot chips when
 * mapSearchReady is false. Non-Lee/Chester published counties get no stamp.
 */
export function resolveCoverageModeForCountyKey(
  countyKey: string,
  mapSearchReady = true,
):
  | "lee_dev_fallback"
  | "chester_demo_synthetic"
  | "chester_real_limited"
  | "montgomery_roof_age_demo"
  | null {
  if (countyKey === "chester-demo") {
    return mapSearchReady ? "chester_demo_synthetic" : null;
  }
  if (countyKey === "chester") {
    return mapSearchReady ? "chester_real_limited" : null;
  }
  if (countyKey === "montgomery") {
    return mapSearchReady ? "montgomery_roof_age_demo" : null;
  }
  if (countyKey === "lee") {
    return "lee_dev_fallback";
  }
  return null;
}
