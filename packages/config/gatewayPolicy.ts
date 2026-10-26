// T028: the shared rate-limit/backoff policy FetchPart uses (apps/sync/handlers/fetchPart.ts,
// T030), parameterized per gateway — never hard-coded per call site (architecture-constitution.md
// §8, §9's config module boundary, NFR-002, ADR-02's "CloudFront first, then Filebase, then
// Pinata — never ipfs.io/dweb.link").
//
// This is a pure policy module: token-bucket admission + backoff-delay math only. It makes no
// network call and knows nothing about HTTP/S3 — FetchPart (apps/sync) is the one place that
// actually fetches bytes, so this module stays test-fast and dependency-free.

/** ADR-02's fixed fallback order. CloudFront first (fastest, confirmed public); Filebase next;
 * Pinata last. Never ipfs.io or dweb.link (retired per ADR-02) — those names never appear here. */
export const GATEWAY_ORDER = ["cloudfront", "filebase", "pinata"] as const;
export type Gateway = (typeof GATEWAY_ORDER)[number];

/** NFR-002: gateway politeness. */
export const MAX_REQUESTS_PER_MINUTE = 30;
export const MAX_RETRIES_BEFORE_SWITCH = 5;
export const BACKOFF_BASE_MS = 200;
export const BACKOFF_CAP_MS = 30_000;

export interface Clock {
  readonly now: () => number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** A simple fixed-window token bucket: `capacity` tokens are available per `windowMs`, refilled
 * all at once when the window elapses (not a continuous trickle) — simple, deterministic, and
 * sufficient for a ≤30 req/min politeness cap. */
export class TokenBucket {
  private tokensRemaining: number;
  private windowStartedAt: number;

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
    private readonly clock: Clock = systemClock,
  ) {
    this.tokensRemaining = capacity;
    this.windowStartedAt = clock.now();
  }

  /** Returns true and consumes one token if the gateway's per-minute cap isn't exhausted yet. */
  tryAcquire(): boolean {
    const now = this.clock.now();
    if (now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now;
      this.tokensRemaining = this.capacity;
    }
    if (this.tokensRemaining <= 0) {
      return false;
    }
    this.tokensRemaining -= 1;
    return true;
  }
}

/** One TokenBucket per gateway (ADR-02), ≤30 req/min each (NFR-002). */
export function createGatewayTokenBuckets(
  clock: Clock = systemClock,
): Record<Gateway, TokenBucket> {
  const buckets = {} as Record<Gateway, TokenBucket>;
  for (const gateway of GATEWAY_ORDER) {
    buckets[gateway] = new TokenBucket(MAX_REQUESTS_PER_MINUTE, 60_000, clock);
  }
  return buckets;
}

/** 429 or any 5xx is retryable (backoff + retry, then switch gateway after 5 exhausted
 * retries — NFR-002); anything else (4xx other than 429, 2xx/3xx) is not. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export interface BackoffOptions {
  readonly baseMs?: number | undefined;
  readonly capMs?: number | undefined;
  /** Injectable randomness in [0, 1) for deterministic tests; defaults to Math.random. */
  readonly random?: (() => number) | undefined;
}

/** Exponential backoff with *full* jitter: `random() * min(cap, base * 2^attempt)`. `attempt` is
 * 0-based (the first retry after an initial failed try). */
export function backoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const base = options.baseMs ?? BACKOFF_BASE_MS;
  const cap = options.capMs ?? BACKOFF_CAP_MS;
  const random = options.random ?? Math.random;
  const deterministicMax = Math.min(cap, base * 2 ** attempt);
  return random() * deterministicMax;
}

/** The next gateway in ADR-02's fixed order, or `undefined` once Pinata's own retries are also
 * exhausted (FetchPart then routes the part to the DLQ — contracts/sync-pipeline.md). */
export function nextGateway(current: Gateway): Gateway | undefined {
  const index = GATEWAY_ORDER.indexOf(current);
  return GATEWAY_ORDER[index + 1];
}
