/**
 * Design tests: session search.inRadius warmup helper.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SearchInRadiusApiClient } from "../../src/map/create-http-search-in-radius-api-client";
import {
  resolveSearchInRadiusWarmupProgressPercent,
  runSearchInRadiusWarmup,
} from "../../src/map/search-in-radius-warmup";

afterEach(() => {
  vi.useRealTimers();
});

describe("runSearchInRadiusWarmup", () => {
  const input = {
    county: "lee",
    center: { lat: 26.6406, lng: -81.8723 },
    radiusMiles: 2,
  };

  it("returns ready on first 2xx", async () => {
    const client: SearchInRadiusApiClient = {
      searchInRadius: vi.fn(async () => []),
    };

    await expect(
      runSearchInRadiusWarmup({ client, input, maxAttempts: 2 }),
    ).resolves.toEqual({ outcome: "ready" });
  });

  it("retries once on 503 then returns ready", async () => {
    vi.useFakeTimers();
    const client: SearchInRadiusApiClient = {
      searchInRadius: vi
        .fn()
        .mockRejectedValueOnce(new Error("search.inRadius failed with HTTP 503"))
        .mockResolvedValueOnce([]),
    };

    const resultPromise = runSearchInRadiusWarmup({
      client,
      input,
      retryDelayMs: 2_000,
      maxAttempts: 2,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(resultPromise).resolves.toEqual({ outcome: "ready" });
    expect(client.searchInRadius).toHaveBeenCalledTimes(2);
  });

  it("returns released after double 503 without deadlocking", async () => {
    vi.useFakeTimers();
    const client: SearchInRadiusApiClient = {
      searchInRadius: vi
        .fn()
        .mockRejectedValue(new Error("search.inRadius failed with HTTP 503")),
    };

    const resultPromise = runSearchInRadiusWarmup({
      client,
      input,
      retryDelayMs: 2_000,
      maxAttempts: 2,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(resultPromise).resolves.toEqual({
      outcome: "released",
      lastError: "search.inRadius failed with HTTP 503",
    });
  });

  it("does not retry HTTP 500 Zod failures", async () => {
    const client: SearchInRadiusApiClient = {
      searchInRadius: vi
        .fn()
        .mockRejectedValue(
          new Error("search.inRadius failed: invalid_type built_year expected number"),
        ),
    };

    await expect(
      runSearchInRadiusWarmup({ client, input, maxAttempts: 2 }),
    ).resolves.toEqual({
      outcome: "released",
      lastError: "search.inRadius failed: invalid_type built_year expected number",
    });
    expect(client.searchInRadius).toHaveBeenCalledTimes(1);
  });
});

describe("resolveSearchInRadiusWarmupProgressPercent", () => {
  it("caps warming progress at 90% until complete", () => {
    expect(resolveSearchInRadiusWarmupProgressPercent(24_000, "warming")).toBe(90);
    expect(resolveSearchInRadiusWarmupProgressPercent(24_000, "ready")).toBe(100);
  });
});
