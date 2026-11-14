/**
 * The lead list's filters that ask the data API: "Leads in this search" and "has a long-open roofing permit".
 * - "Leads in this search" alone, points not truncated: the drawn point IDs are the whole result, so the
 *   answer needs no call. Points truncated (the map draws only the nearest max_points): leads among the drawn
 *   IDs match without a call; the others are checked with parcels.match.
 * - "Has a long-open roofing permit" (with or without "Leads in this search"): every lead is checked with
 *   parcels.match, long_open_permit true and the map's open-duration window; with "Leads in this search" the
 *   search filter is sent too, without it only the lead IDs. Never answered in the browser.
 * - Calls go in chunks of MATCH_CHUNK IDs, paced by a Pacer (at most MATCH_MAX_IN_FLIGHT calls in flight,
 *   call starts at least MATCH_GAP_MS apart, one retry after MATCH_RETRY_MS on TOO_MANY_REQUESTS). A failure
 *   is an error state, never a partial result.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiClient,
  MAX_MATCH_IDS,
  OwnershipBasis,
  PointsResult,
} from "@oracle-la/api-client";
import { basisOf } from "./ownership.ts";
import { daysOfKey } from "./permitDisplay.ts";

/** IDs per parcels.match call. Typed by the API's MAX_MATCH_IDS, so a change there fails the type check here. */
export const MATCH_CHUNK: typeof MAX_MATCH_IDS = 72;
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

/** The search filter of a search key, as parcels.search, points and match take it. */
export interface SearchFilter {
  lat: number;
  lon: number;
  radius_miles: number;
  threshold_years: number;
  /** Present only when the ownership filter is on. */
  ownership_basis?: OwnershipBasis;
}
/**
 * The search key: "lat,lon|radius|threshold" (pin to 6 decimals, as in data-pin-*), plus "|<basis>" when the
 * ownership filter is on, so a search without it keeps the same key.
 */
export const searchKeyOf = (
  lat: number,
  lon: number,
  radius: number,
  threshold: number,
  basis?: OwnershipBasis,
) =>
  `${lat.toFixed(6)},${lon.toFixed(6)}|${radius}|${threshold}${basis ? `|${basis}` : ""}`;
/** The search filter of a search key (ownership_basis only when the key carries one). */
export function filterOfKey(key: string): SearchFilter {
  const [ll, r, t, o] = key.split("|");
  const [lat, lon] = ll!.split(",").map(Number);
  const basis = basisOf(o);
  return {
    lat: lat!,
    lon: lon!,
    radius_miles: Number(r),
    threshold_years: Number(t),
    ...(basis ? { ownership_basis: basis } : {}),
  };
}

type MatchInput = Parameters<ApiClient["parcels"]["match"]["query"]>[0];
/**
 * What the lead list asks parcels.match, as a key: the search key ("Leads in this search" alone), or
 * "<search key or empty>#<window key>" with the long-open toggle (the search key only with "Leads in this
 * search"). Undefined: nothing to ask.
 */
export const questionOf = (searchKey?: string, win?: string) =>
  win === undefined ? searchKey : `${searchKey ?? ""}#${win}`;
/** parcels.match input of a question, without the parcel IDs. */
export function matchInputOf(question: string): Omit<MatchInput, "parcel_ids"> {
  const [s, w] = question.split("#");
  return {
    ...(s ? filterOfKey(s) : {}),
    ...(w === undefined ? {} : { long_open_permit: true, ...daysOfKey(w) }),
  };
}

export interface LeadsInSearch {
  /** There is a search result to filter by ("Leads in this search" can be turned on). */
  available: boolean;
  /** The lead parcel IDs that pass the filters that are on, once known (complete, never partial). */
  ids?: Set<string>;
  /** Number of leads still being checked with parcels.match. */
  checking?: number;
  error?: string;
  /** The long-open toggle is on but the open-duration window is invalid: no call is made. */
  windowInvalid?: boolean;
}

/**
 * The lead parcel IDs that pass the filters that are on. Calls are made only while a filter that needs them
 * is on, and only for leads not already answered for the same question.
 * - inSearch: "Leads in this search" is on (needs a search result).
 * - longOpenWin: the long-open toggle's window key (windowKey, e.g. "1826|"); undefined: the toggle is off;
 *   "": the toggle is on and the window is invalid.
 */
export function useLeadsInSearch(
  api: ApiClient | undefined,
  result: { key: string; points: PointsResult } | undefined,
  leadIds: string[],
  inSearch: boolean,
  longOpenWin?: string,
): LeadsInSearch {
  const pacer = useRef(new Pacer());
  /** Answers per parcel for one question; an error stops further calls for that question. */
  const [checked, setChecked] = useState<{
    key: string;
    matches: Map<string, boolean>;
    error?: string;
  }>();
  const searchKey = result?.key;
  const longOpen = longOpenWin !== undefined;
  const question = longOpen
    ? longOpenWin && (!inSearch || searchKey)
      ? questionOf(inSearch ? searchKey : undefined, longOpenWin)
      : undefined
    : inSearch
      ? searchKey
      : undefined;
  /** Only "Leads in this search" alone answers from the drawn IDs; with the toggle every lead is asked. */
  const viaDrawn = !longOpen;
  const truncated = !!result?.points.truncated;
  const drawn = useMemo(() => new Set(result?.points.id ?? []), [result]);
  const known = checked?.key === question ? checked : undefined;
  // A stable string, so a new leads array with the same parcels does not restart the calls.
  const pendingKey = useMemo(
    () =>
      question && (!viaDrawn || truncated)
        ? leadIds
            .filter(
              (id) => !(viaDrawn && drawn.has(id)) && !known?.matches.has(id),
            )
            .join(",")
        : "",
    [question, viaDrawn, truncated, leadIds, drawn, known],
  );
  const error = known?.error;

  useEffect(() => {
    if (!api || !question || !pendingKey || error) return;
    let live = true;
    const ids = pendingKey.split(",");
    const input = matchInputOf(question);
    const what =
      input.long_open_permit && input.lat !== undefined
        ? "against this search and for a long-open roofing permit"
        : input.long_open_permit
          ? "for a long-open roofing permit"
          : "against this search";
    Promise.all(
      chunks(ids, MATCH_CHUNK).map((part) =>
        pacedWithRetry(pacer.current, () => {
          if (!live) return Promise.resolve({ parcel_ids: [] as string[] });
          return api.parcels.match.query({ ...input, parcel_ids: part });
        }),
      ),
    ).then(
      (res) => {
        if (!live) return;
        const hit = new Set(res.flatMap((r) => r.parcel_ids));
        setChecked((c) => {
          const matches = new Map(c?.key === question ? c.matches : []);
          for (const id of ids) matches.set(id, hit.has(id));
          return { key: question, matches };
        });
      },
      (e: Error) => {
        if (!live) return;
        setChecked((c) => ({
          key: question,
          matches: c?.key === question ? c.matches : new Map(),
          error: `Could not check ${ids.length.toLocaleString("en-US")} leads ${what}: ${e.message}`,
        }));
      },
    );
    return () => {
      live = false;
    };
  }, [api, question, pendingKey, error]);

  const available = !!result;
  if (longOpen) {
    if (!longOpenWin) return { available, windowInvalid: true };
    if (!question) return { available };
    if (error) return { available, error };
    if (pendingKey)
      return { available, checking: pendingKey.split(",").length };
    return {
      available,
      ids: new Set(leadIds.filter((id) => known?.matches.get(id))),
    };
  }
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
