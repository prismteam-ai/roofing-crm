// NFR-001 / data-model.md "agent usage / rate+spend guard": 5 asks/min/user, enforced by one
// atomic conditional DynamoDB UpdateItem per check against `crm-agent-usage` — the same
// conditional-write pattern leadRepo.ts's `expectedSequence` handling uses (ConditionExpression
// evaluated by DynamoDB itself, no read-then-write race window). Constructor-injected `client`,
// the same DI seam `services/leads.ts`'s `createLeadService(leadRepo, options)` uses, so a test
// supplies a doubled DynamoDBDocumentClient instead of a real one.
import { UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { isConditionalCheckFailed, RateLimitedError } from "../agentErrors.js";

export const RATE_LIMIT_PER_MINUTE = 5;

/** Items are harmless to keep past their window; TTL just reclaims storage (data-model.md). */
const ITEM_TTL_SECONDS = 2 * 60;

export interface RateLimiterDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  readonly now?: () => Date;
}

/** `ask` = `agent.ask`; `confirm` = `agent.confirmLead` (CR finding 6c) — same 5/min/user limit,
 *  separate windows, so confirming a proposal never competes with the questions that produced it. */
export type RateLimitScope = "ask" | "confirm";

export interface RateLimiter {
  /** Throws `RateLimitedError` (with `retryAfterSec`) when this call would be the user's 6th+ in
   *  the current UTC minute for `scope` (default `ask`). */
  check(userId: string, scope?: RateLimitScope): Promise<void>;
}

const MS_PER_MINUTE = 60_000;

function windowKey(userId: string, now: Date, scope: RateLimitScope): string {
  const windowMinute = Math.floor(now.getTime() / MS_PER_MINUTE);
  // `ask` keeps the original key shape (data-model.md) so items already in the table still count.
  return scope === "ask"
    ? `USER#${userId}#MIN#${windowMinute}`
    : `USER#${userId}#CONFIRM#MIN#${windowMinute}`;
}

/** Whole seconds until the next UTC minute window opens (>= 1). */
function secondsToNextWindow(now: Date): number {
  const msIntoWindow = now.getTime() % MS_PER_MINUTE;
  return Math.max(1, Math.ceil((MS_PER_MINUTE - msIntoWindow) / 1000));
}

export function createRateLimiter(deps: RateLimiterDeps): RateLimiter {
  const { tableName, client } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async check(userId, scope = "ask") {
      const at = now();
      const ttl = Math.floor(at.getTime() / 1000) + ITEM_TTL_SECONDS;
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: windowKey(userId, at, scope) },
            UpdateExpression: "SET #ttl = :ttl ADD #count :inc",
            ConditionExpression: "attribute_not_exists(pk) OR #count < :limit",
            ExpressionAttributeNames: { "#count": "count", "#ttl": "ttl" },
            ExpressionAttributeValues: {
              ":inc": 1,
              ":limit": RATE_LIMIT_PER_MINUTE,
              ":ttl": ttl,
            },
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          throw new RateLimitedError(userId, secondsToNextWindow(at));
        }
        throw error;
      }
    },
  };
}
