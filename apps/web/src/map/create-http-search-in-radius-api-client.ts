/**
 * HTTP client for search.inRadius over the hosted or local tRPC API.
 */
import { fetchTrpcQuery } from "../api/trpc-http";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Input for SPA radius search (mirrors API search.inRadius).
 */
export interface SearchInRadiusQueryInput {
  county: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  limit?: number;
}

/**
 * Client surface the map shell uses for live radius search.
 */
export interface SearchInRadiusApiClient {
  searchInRadius(input: SearchInRadiusQueryInput): Promise<SearchInRadiusCandidate[]>;
}

/**
 * Builds a SearchInRadiusApiClient over tRPC HTTP JSON.
 */
export function createHttpSearchInRadiusApiClient(
  apiBaseUrl: string,
): SearchInRadiusApiClient {
  return {
    async searchInRadius(
      input: SearchInRadiusQueryInput,
    ): Promise<SearchInRadiusCandidate[]> {
      return fetchTrpcQuery<SearchInRadiusCandidate[]>(
        apiBaseUrl,
        "search.inRadius",
        input,
      );
    },
  };
}
