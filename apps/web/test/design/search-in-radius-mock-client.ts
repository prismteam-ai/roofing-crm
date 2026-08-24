/**
 * Test helpers for `search.inRadius` mocks that account for session warmup.
 */
import { vi } from "vitest";

import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";

type SearchInRadiusFn = SearchInRadiusApiClient["searchInRadius"];
type SearchInRadiusResult = Awaited<ReturnType<SearchInRadiusFn>>;

/**
 * Resolves the mount-time warmup call immediately, then delegates to `afterWarmup`.
 */
export function createSearchInRadiusClientAfterWarmup(
  afterWarmup: SearchInRadiusFn,
): SearchInRadiusApiClient {
  let callCount = 0;
  return {
    searchInRadius: (input) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve([] as SearchInRadiusResult);
      }
      return afterWarmup(input);
    },
  };
}

/**
 * Resolves warmup immediately; tracks invocations on the returned `searchInRadius` spy.
 */
export function createSearchInRadiusClientWithWarmupSpy(): {
  searchInRadiusApiClient: SearchInRadiusApiClient;
  searchInRadius: ReturnType<typeof vi.fn<SearchInRadiusFn>>;
} {
  const searchInRadius = vi.fn(async () => [] as SearchInRadiusResult);
  let callCount = 0;
  const searchInRadiusApiClient: SearchInRadiusApiClient = {
    searchInRadius: (input) => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve([] as SearchInRadiusResult);
      }
      return searchInRadius(input);
    },
  };
  return { searchInRadiusApiClient, searchInRadius };
}
