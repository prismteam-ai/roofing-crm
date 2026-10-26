// Typed agent errors shared by the Application layer (agent/rateLimiter.ts, agent/spendCap.ts)
// and the Entry layer (routers/agent.ts, once it exists), which maps them to tRPC codes. Mirrors
// leadErrors.ts exactly: a `code` field carrying the DynamoDB cancellation reason, and messages
// that never carry the question text or an address (P0-13).
export { IndexNotReadyError } from "./adapters/duckDbParquet.js";

/** True only for a failed condition on a single-item UpdateItem (never the transaction-style
 *  TransactionCanceledException leadRepo.ts handles — a lone UpdateItem fails this way instead). */
export function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

/** The 6th+ `agent.ask` in the same user+minute window (NFR-001: 5 asks/min/user). `code` is the
 *  DynamoDB cancellation reason the conditional UpdateItem produced. */
export class RateLimitedError extends Error {
  readonly code = "ConditionalCheckFailed";
  /** `retryAfterSec`: whole seconds until the next minute window (the Ask screen's throttled hint). */
  constructor(
    readonly userId: string,
    readonly retryAfterSec: number,
  ) {
    super(`User ${userId} exceeded 5 asks/min; wait for the next window`);
    this.name = "RateLimitedError";
  }
}

/** A call whose estimated cost would push the caller's running UTC-day total over the $10/day cap
 *  (checked before any model call, never after). `code` is the DynamoDB cancellation reason. */
export class OverBudgetError extends Error {
  readonly code = "ConditionalCheckFailed";
  /** `resetsAt`: ISO time of the next 00:00 UTC, when the daily cap resets. */
  constructor(
    readonly userId: string,
    readonly resetsAt: string,
  ) {
    super(`User ${userId} would exceed the $10/day agent spend cap`);
    this.name = "OverBudgetError";
  }
}

/** CR finding 4: the rate-limit/spend-cap guard is not configured in this deploy
 *  (`CRM_AGENT_USAGE_TABLE_NAME` unset). The agent fails closed: no model call runs unmetered. */
export class UsageGuardNotConfiguredError extends Error {
  readonly code = "AGENT_GUARD_NOT_CONFIGURED";
  constructor() {
    super("Agent usage guard not configured (CRM_AGENT_USAGE_TABLE_NAME unset); refusing to run");
    this.name = "UsageGuardNotConfiguredError";
  }
}
