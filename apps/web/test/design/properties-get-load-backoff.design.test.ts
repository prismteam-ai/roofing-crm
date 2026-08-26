/**
 * Design tests for properties.get failure backoff.
 *
 * Failed loads must not retry on the next render. Permanent Oracle misses
 * never retry; transient errors wait, then retry with a cap.
 */
import { describe, expect, it } from "vitest";

import {
  PROPERTIES_GET_BACKOFF_INITIAL_MS,
  PROPERTIES_GET_MAX_ATTEMPTS,
  createPropertiesGetFailureGate,
  isPermanentPropertiesGetFailure,
  resolvePropertiesGetRetryAtMs,
} from "../../src/map/properties-get-load-backoff";

describe("properties.get load backoff", () => {
  it("treats Oracle missing-propertyId 500s as permanent", () => {
    expect(
      isPermanentPropertiesGetFailure(
        new Error("getOracleProperty payload missing propertyId"),
      ),
    ).toBe(true);
  });

  it("treats network timeouts as retryable", () => {
    expect(
      isPermanentPropertiesGetFailure(
        new Error("properties.get failed: upstream timeout"),
      ),
    ).toBe(false);
  });

  it("does not schedule a retry after a permanent failure", () => {
    expect(
      resolvePropertiesGetRetryAtMs({
        failedAttemptCount: 1,
        error: new Error("getOracleProperty payload missing propertyId"),
        nowMs: 10_000,
      }),
    ).toBeNull();
  });

  it("backs off exponentially on transient failures until the attempt cap", () => {
    expect(
      resolvePropertiesGetRetryAtMs({
        failedAttemptCount: 1,
        error: new Error("upstream timeout"),
        nowMs: 0,
      }),
    ).toBe(PROPERTIES_GET_BACKOFF_INITIAL_MS);

    expect(
      resolvePropertiesGetRetryAtMs({
        failedAttemptCount: 2,
        error: new Error("upstream timeout"),
        nowMs: 0,
      }),
    ).toBe(PROPERTIES_GET_BACKOFF_INITIAL_MS * 2);

    expect(
      resolvePropertiesGetRetryAtMs({
        failedAttemptCount: PROPERTIES_GET_MAX_ATTEMPTS,
        error: new Error("upstream timeout"),
        nowMs: 0,
      }),
    ).toBeNull();
  });

  it("blocks a second attempt until backoff elapses", () => {
    let nowMs = 1_000;
    const gate = createPropertiesGetFailureGate({ now: () => nowMs });

    expect(gate.shouldAttempt("chester-prop-1")).toBe(true);
    gate.recordFailure("chester-prop-1", new Error("upstream timeout"));
    expect(gate.shouldAttempt("chester-prop-1")).toBe(false);

    nowMs += PROPERTIES_GET_BACKOFF_INITIAL_MS - 1;
    expect(gate.shouldAttempt("chester-prop-1")).toBe(false);

    nowMs += 1;
    expect(gate.shouldAttempt("chester-prop-1")).toBe(true);
  });

  it("never unblocks a permanent Oracle miss", () => {
    let nowMs = 0;
    const gate = createPropertiesGetFailureGate({ now: () => nowMs });

    gate.recordFailure(
      "chester-prop-1",
      new Error("getOracleProperty payload missing propertyId"),
    );
    nowMs += 60_000;
    expect(gate.shouldAttempt("chester-prop-1")).toBe(false);
  });
});
