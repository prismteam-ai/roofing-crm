// T018: Cognito Lambda trigger implementing data-model.md's `LockoutCounter` state machine
// exactly (research.md "custom pre-auth Lambda for the exact lockout rule"): 0 failures →
// 1..3 failures, not locked → (4th consecutive failure) → locked, lockedUntil = now + 5 minutes →
// (cooldown elapses) → 0 failures, not locked. A successful sign-in resets failedAttempts to 0
// without ever locking.
//
// Found deploying (not in the original design): Cognito's PreAuthentication trigger fires
// *before* it validates the password, so it cannot itself observe a failure — the first build
// only wired this gate check and left `recordFailedAttempt` genuinely uncalled by anything,
// which silently made the whole lockout feature a no-op (unit-tested in isolation, never
// exercised against real Cognito). Fixed with two cooperating pieces, decided with the user:
//   1. This same Lambda is now wired as BOTH the PreAuthentication trigger (gate: reject while
//      locked, Cognito-native and unspoofable — `preAuthentication`) AND the PostAuthentication
//      trigger (reset to 0 on an actual successful sign-in, also Cognito-native — `recordSuccess`
//      via the postAuthentication branch below). Dispatches on `event.triggerSource`.
//   2. `recordFailedAttempt` is called from apps/api/src/routers/auth.ts's public
//      `auth.reportFailedAttempt` procedure, which apps/web calls when Cognito's SRP sign-in
//      itself throws NotAuthorizedException. This is client-reported and in principle spoofable
//      (a malicious client could just not call it) — accepted for this story: one shared admin
//      login, no public attacker surface worth hardening against here. The actual *blocking* of
//      a locked account stays entirely server-side and unspoofable (point 1); only the failure
//      *count* trusts the client.
//
// Wrapped in Powertools Logger/Tracer/Metrics like every other Lambda in this story (constitution
// Article VIII, ARD-B §12.13 — not only health.ts).
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics, MetricUnit } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import type { PostAuthenticationTriggerEvent, PreAuthenticationTriggerEvent } from "aws-lambda";
import {
  createDynamoLockoutStore,
  type LockoutCounter,
  type LockoutStore,
} from "./lockout-store.js";

/** The one key every lockout path uses: the sign-in email, trimmed and lower-cased. The web app
 *  reports failures under the email the person typed, while Cognito's triggers receive its
 *  internal sub as `userName`; both must land on the same counter. */
export function lockoutKey(username: string): string {
  return username.trim().toLowerCase();
}

export const MAX_FAILED_ATTEMPTS = 4;
export const LOCKOUT_COOLDOWN_MS = 5 * 60 * 1000;

/** Thrown by `preAuthentication` while locked; Cognito surfaces this as the auth failure's message. */
export class TooManyAttemptsError extends Error {
  readonly code = "TooManyAttemptsError";
  constructor(retryAt: number) {
    super(
      `Too many attempts — try again in 5 minutes (retry at ${new Date(retryAt).toISOString()}).`,
    );
    this.name = "TooManyAttemptsError";
  }
}

function emptyCounter(username: string): LockoutCounter {
  return { username, failedAttempts: 0, lockedUntil: null };
}

/**
 * Called on every sign-in attempt, before Cognito validates the password. Throws
 * `TooManyAttemptsError` while locked; clears an elapsed lock back to 0 failed attempts.
 */
export async function preAuthentication(store: LockoutStore, username: string): Promise<void> {
  const counter = (await store.get(username)) ?? emptyCounter(username);
  if (counter.lockedUntil !== null) {
    if (Date.now() < counter.lockedUntil) {
      throw new TooManyAttemptsError(counter.lockedUntil);
    }
    // Cooldown elapsed: reset before letting the attempt proceed (data-model.md transition).
    await store.put(emptyCounter(username));
  }
}

/**
 * Called after a failed password check. The 4th consecutive failure locks for 5 minutes.
 * Returns the updated counter so the caller (routers/auth.ts) can tell the client this exact
 * attempt just caused the lock — Cognito's own response to this same attempt still says
 * "incorrect password" (the PreAuthentication gate only knows about *prior* failures, found
 * deploying), so without this the typed lockout message wouldn't appear until a 5th attempt.
 */
export async function recordFailedAttempt(
  store: LockoutStore,
  username: string,
): Promise<LockoutCounter> {
  const counter = (await store.get(username)) ?? emptyCounter(username);
  const failedAttempts = counter.failedAttempts + 1;
  const lockedUntil =
    failedAttempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_COOLDOWN_MS : null;
  const updated: LockoutCounter = { username, failedAttempts, lockedUntil };
  await store.put(updated);
  return updated;
}

/** Called after a successful sign-in. Resets the counter to 0 without ever locking. */
export async function recordSuccess(store: LockoutStore, username: string): Promise<void> {
  await store.put(emptyCounter(username));
}

const logger = new Logger({ serviceName: "crm-ops-lockout" });
const tracer = new Tracer({ serviceName: "crm-ops-lockout" });
const metrics = new Metrics({ namespace: "RoofingCrm", serviceName: "crm-ops-lockout" });

let cachedStore: LockoutStore | undefined;
function lockoutStore(): LockoutStore {
  if (cachedStore === undefined) {
    const tableName = process.env.LOCKOUT_TABLE_NAME;
    if (tableName === undefined || tableName === "") {
      throw new Error("LOCKOUT_TABLE_NAME is not set");
    }
    cachedStore = createDynamoLockoutStore(tableName);
  }
  return cachedStore;
}

type LockoutTriggerEvent = PreAuthenticationTriggerEvent | PostAuthenticationTriggerEvent;

/**
 * The Cognito Lambda trigger entry point, wired as both PreAuthentication and PostAuthentication
 * (infra/lib/crm-ops-stack.ts) — dispatches on `event.triggerSource` since Cognito invokes
 * whatever single Lambda is configured for each trigger type it's attached to.
 */
export async function handler<T extends LockoutTriggerEvent>(event: T): Promise<T> {
  const segment = tracer.getSegment();
  // Prefer the email attribute: `userName` is Cognito's sub when sign-in is by email alias.
  const username = lockoutKey(event.request.userAttributes.email ?? event.userName);
  if (event.triggerSource === "PostAuthentication_Authentication") {
    const subsegment = segment?.addNewSubsegment("## crm-ops-lockout.postAuthentication");
    logger.info("post-authentication: resetting lockout counter", { username });
    try {
      await recordSuccess(lockoutStore(), username);
      metrics.addMetric("LockoutCounterReset", MetricUnit.Count, 1);
      return event;
    } finally {
      subsegment?.close();
      metrics.publishStoredMetrics();
    }
  }
  const subsegment = segment?.addNewSubsegment("## crm-ops-lockout.preAuthentication");
  logger.info("pre-authentication check", { username });
  try {
    await preAuthentication(lockoutStore(), username);
    metrics.addMetric("LockoutChecksPassed", MetricUnit.Count, 1);
    return event;
  } catch (error) {
    metrics.addMetric("LockoutRejections", MetricUnit.Count, 1);
    logger.warn("sign-in rejected: locked out", { username });
    throw error;
  } finally {
    subsegment?.close();
    metrics.publishStoredMetrics();
  }
}
