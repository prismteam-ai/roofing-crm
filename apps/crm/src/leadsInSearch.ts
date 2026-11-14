/**
 * "Leads in this search": which leads' parcels the current search matches.
 * - Points not truncated: the drawn point IDs are the whole result, so the answer needs no call.
 * - Points truncated (the map draws only the nearest max_points): leads among the drawn IDs match without a
 *   call; the others are checked with parcels.match in chunks of MATCH_CHUNK IDs, paced by a Pacer
 *   (at most MATCH_MAX_IN_FLIGHT calls in flight, call starts at least MATCH_GAP_MS apart, one retry after
 *   MATCH_RETRY_MS on TOO_MANY_REQUESTS). A failure is an error state, never a partial result.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiClient,
  MAX_MATCH_IDS,
  PointsResult,
} from "@oracle-la/api-client";

/**
 * IDs per parcels.match call. Typed by the API's MAX_MATCH_IDS, so a change there fails the type check here; the
 * old 80 is allowed in this type until the next commit sets MAX_MATCH_IDS (72).
 */
export const MATCH_CHUNK: typeof MAX_MATCH_IDS | 80 = 80;
export const MATCH_MAX_IN_FLIGHT = 2;
export const MATCH_GAP_MS = 250;
export const MATCH_RETRY_MS = 1000;

const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** Limits concurrent calls and spaces their starts. One per app, so overlapping runs share the limits. */
export class Pacer {
  private inFlight = 0;
  private lastStart = -Infinity;
  private waiters: Array<() => void> = [];
  private readonly max: number;
  private readonly gapMs: number;
  constructor(max = MATCH_MAX_IN_FLIGHT, gapMs = MATCH_GAP_MS) {
    this.max = max;
    this.gapMs = gapMs;
  }

  /** Runs fn once a slot is free, no earlier than notBefore (ms since epoch) and gapMs after the last start. */
  async run<R>(fn: () => Promise<R>, notBefore = 0): Promise<R> {
    for (;;) {
      if (this.inFlight >= this.max) {
        await new Promise<void>((r) => this.waiters.push(r));
        continue;
      }
      const at = Math.max(Date.now(), this.lastStart + this.gapMs, notBefore);
      if (at > Date.now()) {
        await sleep(at - Date.now());
        continue;
      }
      this.inFlight++;
      this.lastStart = Date.now();
      break;
    }
    try {
      return await fn();
    } finally {
      this.inFlight--;
      this.waiters.shift()?.();
    }
  }
}

/** A throttling refusal: tRPC's TOO_MANY_REQUESTS, or an HTTP 429 from API Gateway (not a tRPC body). */
export function isTooManyRequests(e: unknown): boolean {
  const x = e as {
    data?: { code?: string; httpStatus?: number };
    meta?: { response?: { status?: number } };
  };
  return (
    x?.data?.code === "TOO_MANY_REQUESTS" ||
    x?.data?.httpStatus === 429 ||
    x?.meta?.response?.status === 429
  );
}

/** Runs call through the pacer; on a throttling refusal, retries once MATCH_RETRY_MS later. */
export async function pacedWithRetry<R>(
  pacer: Pacer,
  call: () => Promise<R>,
): Promise<R> {
  try {
    return await pacer.run(call);
  } catch (e) {
    if (!isTooManyRequests(e)) throw e;
    return pacer.run(call, Date.now() + MATCH_RETRY_MS);
  }
}

export const chunks = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) =>
    xs.slice(i * n, i * n + n),
  );

/** The search filter of a result key ("lat,lon|radius|threshold", as App builds it). */
export function filterOfKey(key: string) {
  const [ll, r, t] = key.split("|");
  const [lat, lon] = ll!.split(",").map(Number);
  return {
    lat: lat!,
    lon: lon!,
    radius_miles: Number(r),
    threshold_years: Number(t),
  };
}

export interface LeadsInSearch {
  /** There is a search result to filter by. */
  available: boolean;
  /** The matching lead parcel IDs, once known (complete, never partial). */
  ids?: Set<string>;
  /** Number of leads still being checked with parcels.match. */
  checking?: number;
  error?: string;
}

/**
 * The lead parcel IDs that the current result matches. Calls are made only while `enabled` (the filter is
 * on) and only for leads not drawn and not already checked for this result.
 */
export function useLeadsInSearch(
  api: ApiClient | undefined,
  result: { key: string; points: PointsResult } | undefined,
  leadIds: string[],
  enabled: boolean,
): LeadsInSearch {
  const pacer = useRef(new Pacer());
  /** Answers per parcel for one result key; an error stops further calls for that key. */
  const [checked, setChecked] = useState<{
    key: string;
    matches: Map<string, boolean>;
    error?: string;
  }>();
  const key = result?.key;
  const truncated = !!result?.points.truncated;
  const drawn = useMemo(() => new Set(result?.points.id ?? []), [result]);
  const known = checked?.key === key ? checked : undefined;
  // A stable string, so a new leads array with the same parcels does not restart the calls.
  const pendingKey = useMemo(
    () =>
      truncated && enabled
        ? leadIds
            .filter((id) => !drawn.has(id) && !known?.matches.has(id))
            .join(",")
        : "",
    [truncated, enabled, leadIds, drawn, known],
  );
  const error = known?.error;

  useEffect(() => {
    if (!api || !key || !pendingKey || error) return;
    let live = true;
    const ids = pendingKey.split(",");
    const filter = filterOfKey(key);
    Promise.all(
      chunks(ids, MATCH_CHUNK).map((part) =>
        pacedWithRetry(pacer.current, () => {
          if (!live) return Promise.resolve({ parcel_ids: [] as string[] });
          return api.parcels.match.query({ ...filter, parcel_ids: part });
        }),
      ),
    ).then(
      (res) => {
        if (!live) return;
        const hit = new Set(res.flatMap((r) => r.parcel_ids));
        setChecked((c) => {
          const matches = new Map(c?.key === key ? c.matches : []);
          for (const id of ids) matches.set(id, hit.has(id));
          return { key, matches };
        });
      },
      (e: Error) => {
        if (!live) return;
        setChecked((c) => ({
          key,
          matches: c?.key === key ? c.matches : new Map(),
          error: `Could not check ${ids.length.toLocaleString("en-US")} leads against this search: ${e.message}`,
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [api, key, pendingKey, error]);

  if (!result) return { available: false };
  if (!truncated) return { available: true, ids: drawn };
  if (error) return { available: true, error };
  if (pendingKey)
    return { available: true, checking: pendingKey.split(",").length };
  const ids = new Set<string>();
  for (const id of leadIds)
    if (drawn.has(id) || known?.matches.get(id)) ids.add(id);
  return { available: true, ids };
}
