/**
 * React hook: session `search.inRadius` warmup on mount for hosted APIs.
 */
import { useEffect, useState } from "react";

import type { SearchInRadiusApiClient } from "./create-http-search-in-radius-api-client";
import {
  resolveSearchInRadiusWarmupProgressPercent,
  runSearchInRadiusWarmup,
  type SearchInRadiusWarmupInput,
  type SearchInRadiusWarmupPhase,
} from "./search-in-radius-warmup";

export interface UseSearchInRadiusRadarWarmupArguments {
  searchInRadiusApiClient: SearchInRadiusApiClient | undefined;
  warmupInput: SearchInRadiusWarmupInput | null;
}

export interface UseSearchInRadiusRadarWarmupResult {
  phase: SearchInRadiusWarmupPhase;
  startedAtMs: number | null;
  progressPercent: number;
  /** True once warmup succeeded with a 2xx body. */
  radarWarmSucceeded: boolean;
  /** True when live radius search may run (ready or released after retries). */
  searchGateOpen: boolean;
  /** True when the walk-radius circle may render on the map. */
  showSearchRadiusCircle: boolean;
}

/**
 * Warms hosted radius search on load; skips immediately when no live client.
 */
export function useSearchInRadiusRadarWarmup({
  searchInRadiusApiClient,
  warmupInput,
}: UseSearchInRadiusRadarWarmupArguments): UseSearchInRadiusRadarWarmupResult {
  const [phase, setPhase] = useState<SearchInRadiusWarmupPhase>(
    searchInRadiusApiClient === undefined ? "ready" : "idle",
  );
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [tickMs, setTickMs] = useState(0);

  useEffect(() => {
    if (searchInRadiusApiClient === undefined || warmupInput === null) {
      setPhase("ready");
      setStartedAtMs(null);
      return;
    }

    let cancelled = false;
    const started = Date.now();
    setStartedAtMs(started);
    setPhase("warming");

    void (async () => {
      const result = await runSearchInRadiusWarmup({
        client: searchInRadiusApiClient,
        input: warmupInput,
      });
      if (cancelled) {
        return;
      }
      setPhase(result.outcome === "ready" ? "ready" : "released");
    })();

    return () => {
      cancelled = true;
    };
  }, [searchInRadiusApiClient, warmupInput]);

  useEffect(() => {
    if (phase !== "warming" || startedAtMs === null) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setTickMs(Date.now() - startedAtMs);
    }, 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase, startedAtMs]);

  const elapsedMs = phase === "warming" && startedAtMs !== null ? tickMs : 0;
  const progressPercent = resolveSearchInRadiusWarmupProgressPercent(elapsedMs, phase);
  const radarWarmSucceeded = phase === "ready";
  const searchGateOpen =
    phase === "ready" || phase === "released" || searchInRadiusApiClient === undefined;
  const showSearchRadiusCircle = searchGateOpen;

  return {
    phase,
    startedAtMs,
    progressPercent,
    radarWarmSucceeded,
    searchGateOpen,
    showSearchRadiusCircle,
  };
}
