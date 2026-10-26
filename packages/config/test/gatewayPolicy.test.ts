// T027: packages/config/gatewayPolicy.ts's token-bucket + backoff policy (NFR-002, ADR-02).
// T028 implements packages/config/gatewayPolicy.ts to make this pass — intentionally failing now
// (no module exists yet).
import { describe, expect, it } from "vitest";
import {
  GATEWAY_ORDER,
  MAX_REQUESTS_PER_MINUTE,
  MAX_RETRIES_BEFORE_SWITCH,
  TokenBucket,
  backoffDelayMs,
  isRetryableStatus,
  nextGateway,
} from "../gatewayPolicy.js";

describe("gatewayPolicy", () => {
  it("never allows more than 30 requests per minute per gateway", () => {
    const now = 0;
    const bucket = new TokenBucket(MAX_REQUESTS_PER_MINUTE, 60_000, { now: () => now });
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) {
      expect(bucket.tryAcquire()).toBe(true);
    }
    // The 31st request in the same minute window must be refused.
    expect(bucket.tryAcquire()).toBe(false);
  });

  it("refills after the window elapses", () => {
    let now = 0;
    const bucket = new TokenBucket(MAX_REQUESTS_PER_MINUTE, 60_000, { now: () => now });
    for (let i = 0; i < MAX_REQUESTS_PER_MINUTE; i++) bucket.tryAcquire();
    expect(bucket.tryAcquire()).toBe(false);
    now += 60_000;
    expect(bucket.tryAcquire()).toBe(true);
  });

  it("tracks a separate bucket per gateway (CloudFront, Filebase, Pinata — ADR-02)", () => {
    expect(GATEWAY_ORDER).toEqual(["cloudfront", "filebase", "pinata"]);
  });

  it("treats 429 and any 5xx response as retryable, everything else as not", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(599)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(200)).toBe(false);
  });

  it("computes exponential backoff with full jitter, strictly increasing and capped", () => {
    // Full jitter at random()=1 returns the cap itself at each attempt: min(capMs, base*2^attempt).
    const delays = Array.from({ length: 6 }, (_, attempt) =>
      backoffDelayMs(attempt, { random: () => 1 }),
    );
    for (let i = 1; i < delays.length; i++) {
      const previous = delays[i - 1] ?? 0;
      const current = delays[i] ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(30_000);
    }
  });

  it("full jitter never exceeds the deterministic max for that attempt", () => {
    const max = backoffDelayMs(2, { random: () => 1 });
    const sample = backoffDelayMs(2, { random: () => 0.37 });
    expect(sample).toBeLessThanOrEqual(max);
    expect(sample).toBeGreaterThanOrEqual(0);
  });

  it("caps retries at 5 before switching gateway, per NFR-002", () => {
    expect(MAX_RETRIES_BEFORE_SWITCH).toBe(5);
  });

  it("switches CloudFront -> Filebase -> Pinata, never beyond Pinata, never ipfs.io/dweb.link", () => {
    expect(nextGateway("cloudfront")).toBe("filebase");
    expect(nextGateway("filebase")).toBe("pinata");
    expect(nextGateway("pinata")).toBeUndefined();
    expect(GATEWAY_ORDER).not.toContain("ipfs.io");
    expect(GATEWAY_ORDER).not.toContain("dweb.link");
  });
});
