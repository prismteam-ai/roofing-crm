/**
 * Session warmup for hosted `search.inRadius` (Lambda + MCP process start).
 *
 * Fires a small county-seat ping on load so the first operator pin-drop can
 * reuse a warm Lambda. HTTP 503 (~29s gateway) retries once; 500 does not loop.
 */
import type { SearchInRadiusApiClient } from "./create-http-search-in-radius-api-client";

/** Warmup lifecycle for the map radar gate. */
export type SearchInRadiusWarmupPhase = "idle" | "warming" | "ready" | "released";

export interface SearchInRadiusWarmupInput {
  county: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  limit?: number;
}

export interface RunSearchInRadiusWarmupOptions {
  client: SearchInRadiusApiClient;
  input: SearchInRadiusWarmupInput;
  retryDelayMs?: number;
  maxAttempts?: number;
}

export interface SearchInRadiusWarmupResult {
  /** `ready` when a warmup call returned candidates; `released` when the gate opens without a 2xx. */
  outcome: "ready" | "released";
  lastError?: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isRetryableWarmupError(message: string): boolean {
  return /\b503\b|Service Unavailable/i.test(message);
}

/**
 * Runs one or more warmup `search.inRadius` calls until success or retries exhaust.
 */
export async function runSearchInRadiusWarmup(
  options: RunSearchInRadiusWarmupOptions,
): Promise<SearchInRadiusWarmupResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 2_000;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await options.client.searchInRadius({
        county: options.input.county,
        center: options.input.center,
        radiusMiles: options.input.radiusMiles,
        limit: options.input.limit ?? 5,
      });
      return { outcome: "ready" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Radius warmup failed.";
      const shouldRetry =
        attempt < maxAttempts - 1 && isRetryableWarmupError(lastError);
      if (shouldRetry) {
        await sleep(retryDelayMs);
        continue;
      }
      break;
    }
  }

  return { outcome: "released", lastError };
}

/** Expected hosted warmup duration for the readiness meter (ms). */
export const SEARCH_IN_RADIUS_WARMUP_EXPECTED_MS = 8_000;

/**
 * Maps elapsed warmup time to a 0–100 meter value (caps at 90% until complete).
 */
export function resolveSearchInRadiusWarmupProgressPercent(
  elapsedMs: number,
  phase: SearchInRadiusWarmupPhase,
): number {
  if (phase === "ready" || phase === "released") {
    return 100;
  }
  if (phase === "idle") {
    return 0;
  }
  const raw = (elapsedMs / SEARCH_IN_RADIUS_WARMUP_EXPECTED_MS) * 100;
  return Math.min(90, Math.max(4, Math.round(raw)));
}
