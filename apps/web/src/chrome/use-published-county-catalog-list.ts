/**
 * Loads counties.list for the territory picker.
 *
 * Starts empty (loading) so first paint never claims Lee before the catalog
 * answers; falls back to Lee only when the API is missing or the request
 * fails, so the heading still names a real served place.
 */
import { useEffect, useState } from "react";

import type { CountiesListApiClient } from "./create-http-counties-list-api-client";
import {
  LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
  type PublishedCountyCatalogListItem,
} from "./published-county-catalog-list-item";

/**
 * Returns searchable published counties for the territory heading picker.
 *
 * An empty array means the catalog is still loading — callers must treat it
 * as "territory unknown", not as Lee.
 */
export function usePublishedCountyCatalogList(
  countiesListApiClient: CountiesListApiClient | undefined,
): PublishedCountyCatalogListItem[] {
  const [publishedCountyCatalogListItems, setPublishedCountyCatalogListItems] =
    useState<PublishedCountyCatalogListItem[]>([]);

  useEffect(() => {
    if (countiesListApiClient === undefined) {
      setPublishedCountyCatalogListItems(LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const listed = await countiesListApiClient.listPublishedCounties();
        if (cancelled) {
          return;
        }
        setPublishedCountyCatalogListItems(
          listed.length > 0 ? listed : LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
        );
      } catch {
        if (!cancelled) {
          setPublishedCountyCatalogListItems(
            LEE_FALLBACK_PUBLISHED_COUNTY_CATALOG_LIST,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [countiesListApiClient]);

  return publishedCountyCatalogListItems;
}
