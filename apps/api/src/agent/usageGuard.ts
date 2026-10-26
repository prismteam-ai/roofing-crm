// Lazy singleton for the agent's `crm-agent-usage`-backed guard — the T018 rate-limiter/spend-cap
// pair, the per-thread proposal store (CR finding 6b), and the configured model's price (CR
// finding 5) — built once per Lambda sandbox from `CRM_AGENT_USAGE_TABLE_NAME` and
// `AGENT_MODEL_ID` (infra/lib/crm-api-stack.ts), never per request.
//
// CR finding 4: fails closed. An unset table name throws `UsageGuardNotConfiguredError` and an
// unpriced model throws `UnpricedModelError` — the agent never runs a model call it can't meter
// (unlike `tryLeadIndex`'s "degrade, don't crash" rule for read-only search, an unenforced guard
// is an unbounded-spend hole, not a degraded feature).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { UsageGuardNotConfiguredError } from "../agentErrors.js";
import { MissingAgentModelIdError } from "./getModel.js";
import { priceForModel, type ModelPrice } from "./modelPricing.js";
import { createRateLimiter, type RateLimiter } from "./rateLimiter.js";
import { createSpendCap, type SpendCap } from "./spendCap.js";
import { createThreadStore, type ThreadStore } from "./threadStore.js";

export interface UsageGuard {
  readonly rateLimiter: RateLimiter;
  readonly spendCap: SpendCap;
  readonly threadStore: ThreadStore;
  /** Price of the deployed `AGENT_MODEL_ID` (agent/modelPricing.ts). */
  readonly price: ModelPrice;
}

let cached: UsageGuard | undefined;
let override: UsageGuard | undefined;

export function requireUsageGuard(
  env: Record<string, string | undefined> = process.env,
): UsageGuard {
  if (override !== undefined) return override;
  if (cached === undefined) {
    const tableName = env.CRM_AGENT_USAGE_TABLE_NAME;
    if (tableName === undefined || tableName === "") throw new UsageGuardNotConfiguredError();
    const modelId = env.AGENT_MODEL_ID;
    if (modelId === undefined || modelId === "") throw new MissingAgentModelIdError();
    const price = priceForModel(modelId);
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    cached = {
      rateLimiter: createRateLimiter({ tableName, client }),
      spendCap: createSpendCap({ tableName, client }),
      threadStore: createThreadStore({ tableName, client }),
      price,
    };
  }
  return cached;
}

/** Test-only injection point, same shape as `setLeadIndexForTest`/`setLeadServiceForTest`. */
export function setUsageGuardForTest(guard: UsageGuard): void {
  override = guard;
}

/** Test-only: drop any injected or cached guard, so the next call re-reads the environment. */
export function resetUsageGuardForTest(): void {
  override = undefined;
  cached = undefined;
}
