/**
 * HTTP client for counties.list over the hosted or local tRPC API.
 */
import { fetchTrpcQuery } from "../api/trpc-http";
import type { PublishedCountyCatalogListItem } from "./published-county-catalog-list-item";

/**
 * Client surface the territory picker uses for the live published-county catalog.
 */
export interface CountiesListApiClient {
  listPublishedCounties(): Promise<PublishedCountyCatalogListItem[]>;
  getDefaultCounty(): Promise<{
    countyKey: string;
    coverageMode:
      | "lee_dev_fallback"
      | "chester_demo_synthetic"
      | "chester_real_limited"
      | "montgomery_roof_age_demo";
  }>;
}

/**
 * Builds a CountiesListApiClient over tRPC HTTP JSON.
 */
export function createHttpCountiesListApiClient(
  apiBaseUrl: string,
): CountiesListApiClient {
  return {
    async listPublishedCounties(): Promise<PublishedCountyCatalogListItem[]> {
      return fetchTrpcQuery<PublishedCountyCatalogListItem[]>(
        apiBaseUrl,
        "counties.list",
      );
    },
    async getDefaultCounty() {
      return fetchTrpcQuery<{
        countyKey: string;
        coverageMode:
          | "lee_dev_fallback"
          | "chester_demo_synthetic"
          | "chester_real_limited"
          | "montgomery_roof_age_demo";
      }>(apiBaseUrl, "counties.defaultCounty");
    },
  };
}
