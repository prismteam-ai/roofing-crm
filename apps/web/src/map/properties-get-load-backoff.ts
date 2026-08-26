/**
 * Backoff gate for failed properties.get loads.
 *
 * Permanent Oracle misses never retry. Transient failures wait exponentially
 * and stop after PROPERTIES_GET_MAX_ATTEMPTS.
 */

export const PROPERTIES_GET_BACKOFF_INITIAL_MS = 1_000;
export const PROPERTIES_GET_BACKOFF_FACTOR = 2;
export const PROPERTIES_GET_BACKOFF_MAX_MS = 16_000;
export const PROPERTIES_GET_MAX_ATTEMPTS = 4;

/**
 * Clock used by the failure gate so tests can advance time without timers.
 */
export interface PropertiesGetFailureGateClock {
  now: () => number;
}

/**
 * In-memory backoff records for failed property loads.
 */
export interface PropertiesGetFailureGate {
  shouldAttempt: (propertyId: string) => boolean;
  recordFailure: (propertyId: string, error: unknown) => number | null;
  recordSuccess: (propertyId: string) => void;
  clear: () => void;
}

interface PropertiesGetFailureRecord {
  failedAttemptCount: number;
  retryAtMs: number | null;
}

/**
 * Oracle / contract errors that will not succeed on retry.
 */
export function isPermanentPropertiesGetFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /payload missing propertyId/i.test(message);
}

/**
 * Next retry instant, or null when the load must not retry.
 */
export function resolvePropertiesGetRetryAtMs(arguments_: {
  failedAttemptCount: number;
  error: unknown;
  nowMs: number;
}): number | null {
  if (isPermanentPropertiesGetFailure(arguments_.error)) {
    return null;
  }
  if (arguments_.failedAttemptCount >= PROPERTIES_GET_MAX_ATTEMPTS) {
    return null;
  }
  const delayMs = Math.min(
    PROPERTIES_GET_BACKOFF_INITIAL_MS *
      PROPERTIES_GET_BACKOFF_FACTOR ** (arguments_.failedAttemptCount - 1),
    PROPERTIES_GET_BACKOFF_MAX_MS,
  );
  return arguments_.nowMs + delayMs;
}

/**
 * Tracks per-property failure backoff for the shared properties.get cache.
 */
export function createPropertiesGetFailureGate(
  clock: PropertiesGetFailureGateClock = { now: () => Date.now() },
): PropertiesGetFailureGate {
  const failures = new Map<string, PropertiesGetFailureRecord>();

  return {
    shouldAttempt(propertyId: string): boolean {
      const failure = failures.get(propertyId);
      if (failure === undefined) {
        return true;
      }
      if (failure.retryAtMs === null) {
        return false;
      }
      return clock.now() >= failure.retryAtMs;
    },
    recordFailure(propertyId: string, error: unknown): number | null {
      const previous = failures.get(propertyId);
      const failedAttemptCount = (previous?.failedAttemptCount ?? 0) + 1;
      const retryAtMs = resolvePropertiesGetRetryAtMs({
        failedAttemptCount,
        error,
        nowMs: clock.now(),
      });
      failures.set(propertyId, {
        failedAttemptCount,
        retryAtMs,
      });
      return retryAtMs;
    },
    recordSuccess(propertyId: string): void {
      failures.delete(propertyId);
    },
    clear(): void {
      failures.clear();
    },
  };
}
