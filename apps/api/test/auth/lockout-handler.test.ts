// T011 (data-model.md LockoutCounter state transitions): write first, confirm it fails (no
// handler exists yet). Asserts 0→3 failed attempts stay unlocked, the 4th sets
// lockedUntil = now+5m, a request during the cooldown is rejected with the typed lockout error,
// and the cooldown's expiry resets failedAttempts to 0.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCKOUT_COOLDOWN_MS,
  MAX_FAILED_ATTEMPTS,
  TooManyAttemptsError,
  preAuthentication,
  recordFailedAttempt,
  recordSuccess,
} from "../../src/auth/lockout-handler.js";
import { createInMemoryLockoutStore, type LockoutStore } from "../../src/auth/lockout-store.js";

const USERNAME = "admin@roofing-crm.test";

describe("lockout state machine (data-model.md LockoutCounter)", () => {
  let store: LockoutStore;

  beforeEach(() => {
    store = createInMemoryLockoutStore();
    vi.useRealTimers();
  });

  it("0→3 failed attempts never lock the account", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      await expect(preAuthentication(store, USERNAME)).resolves.toBeUndefined();
      await recordFailedAttempt(store, USERNAME);
    }
    const counter = await store.get(USERNAME);
    expect(counter?.failedAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
    expect(counter?.lockedUntil).toBeNull();
  });

  it("the 4th consecutive failure sets lockedUntil = now + 5 minutes", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await preAuthentication(store, USERNAME);
      await recordFailedAttempt(store, USERNAME);
    }
    const counter = await store.get(USERNAME);
    expect(counter?.failedAttempts).toBe(MAX_FAILED_ATTEMPTS);
    expect(counter?.lockedUntil).not.toBeNull();
    if (!counter?.lockedUntil) throw new Error("expected lockedUntil to be set");
    expect(counter.lockedUntil - Date.now()).toBeGreaterThan(LOCKOUT_COOLDOWN_MS - 1000);
    expect(counter.lockedUntil - Date.now()).toBeLessThanOrEqual(LOCKOUT_COOLDOWN_MS);
  });

  it("a request during the cooldown is rejected with TooManyAttemptsError, never a generic error", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await preAuthentication(store, USERNAME);
      await recordFailedAttempt(store, USERNAME);
    }
    await expect(preAuthentication(store, USERNAME)).rejects.toBeInstanceOf(TooManyAttemptsError);
    await expect(preAuthentication(store, USERNAME)).rejects.toThrow(/Too many attempts/);
  });

  it("the cooldown's expiry resets failedAttempts to 0 and lets the attempt proceed", async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await preAuthentication(store, USERNAME);
      await recordFailedAttempt(store, USERNAME);
    }
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + LOCKOUT_COOLDOWN_MS + 1);
    await expect(preAuthentication(store, USERNAME)).resolves.toBeUndefined();
    const counter = await store.get(USERNAME);
    expect(counter?.failedAttempts).toBe(0);
    expect(counter?.lockedUntil).toBeNull();
    vi.useRealTimers();
  });

  it("a successful sign-in before the 4th failure resets failedAttempts to 0 without ever locking", async () => {
    await preAuthentication(store, USERNAME);
    await recordFailedAttempt(store, USERNAME);
    await recordFailedAttempt(store, USERNAME);
    await recordSuccess(store, USERNAME);
    const counter = await store.get(USERNAME);
    expect(counter?.failedAttempts).toBe(0);
    expect(counter?.lockedUntil).toBeNull();
  });
});
