/**
 * The panel's warm-up:
 * GET /agent/warm and DATA_WARM_REQUESTS (2) data API requests, all sent at once, so the agent's function and two
 * data API instances are initialized before the first question. A question asked while a warm-up runs is held
 * until every warm-up request has answered (any response, or a network failure) or HOLD_MAX_MS after it was
 * asked, whichever comes first. When the panel's last data API response is older than REWARM_AFTER_MS (or there
 * was none), the warm-up runs again before the question and the question is held the same way.
 */

/** Longest a question is held for the warm-up (ms). */
export const HOLD_MAX_MS = 20_000;
/** A data API response older than this (ms) means its instances may be cold again: warm up before sending. */
export const REWARM_AFTER_MS = 4 * 60_000;
/** Data API requests per warm-up, sent together (one per instance to warm). */
export const DATA_WARM_REQUESTS = 2;

export interface WarmupDeps {
  /** GET /agent/warm. */
  warmAgent: () => Promise<unknown>;
  /** One cheap data API request (meta.info), never batched with the other. */
  warmData: () => Promise<unknown>;
  now?: () => number;
}

export interface Warmup {
  /** Starts a warm-up unless one is running; resolves when all its requests have answered. Never rejects. */
  start: () => Promise<void>;
  /** True while a warm-up runs. */
  running: () => boolean;
  /** True when the last data API response is missing or older than REWARM_AFTER_MS. */
  stale: () => boolean;
  /** Resolves "warm" when the running warm-up has answered (at once when none runs), or "timeout" at HOLD_MAX_MS. */
  hold: () => Promise<"warm" | "timeout">;
}

export function createWarmup(deps: WarmupDeps): Warmup {
  const now = deps.now ?? (() => Date.now());
  let current: Promise<void> | undefined;
  let lastData: number | undefined;
  const dataAnswered = () => {
    lastData = now();
  };
  const start = () => {
    if (current) return current;
    // Every request is started here, synchronously, before any is awaited: they go out together.
    const requests = [
      deps.warmAgent(),
      ...Array.from({ length: DATA_WARM_REQUESTS }, () =>
        deps.warmData().then(dataAnswered),
      ),
    ];
    const p = Promise.allSettled(requests).then(() => {
      if (current === p) current = undefined;
    });
    current = p;
    return p;
  };
  return {
    start,
    running: () => current !== undefined,
    stale: () => lastData === undefined || now() - lastData > REWARM_AFTER_MS,
    hold: () => {
      if (!current) return Promise.resolve("warm" as const);
      let timer: ReturnType<typeof setTimeout> | undefined;
      return Promise.race([
        current.then(() => "warm" as const),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), HOLD_MAX_MS);
        }),
      ]).finally(() => clearTimeout(timer));
    },
  };
}
