// NFR-001 / data-model.md "agent usage / rate+spend guard": $10/day = 1000 cents (raised from $3 on 2026-10-26, see the amendment history in docs/architecture-constitution.md), checked (and
// reserved) before any model call via one atomic conditional DynamoDB UpdateItem against
// `crm-agent-usage` — same conditional-write pattern as leadRepo.ts's `expectedSequence` handling,
// and the same constructor-injected-client DI seam as `services/leads.ts`'s `createLeadService`.
//
// The condition can't express "current + estimate > cap" directly (DynamoDB condition
// expressions compare, they don't add), so the comparison is inverted into a literal computed in
// this module: `costCents <= (cap - estimate)` is exactly "current + estimate <= cap", evaluated
// against the pre-reservation balance, so a call that would push the running total over the cap
// fails the condition before anything is added.
//
// CR finding 5: the reservation is a conservative estimate (agent/modelPricing.ts) made before the
// first model call; after the turn, `reconcile` replaces it with the metered cost by ADDing the
// (usually negative) delta to the same day item — one atomic UpdateItem, so concurrent asks from
// the same user never lose each other's updates. `costCents` may be fractional.
import { UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { isConditionalCheckFailed, OverBudgetError } from "../agentErrors.js";

/** $10/day per user (NFR-001; raised from $3 on 2026-10-26 so a demo plus the golden-query runs fit
 *  one day's budget), in cents. */
export const DAILY_CAP_CENTS = 1000;

/** Items are harmless to keep past their day; TTL just reclaims storage (data-model.md). */
const ITEM_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Below this, a reconcile delta is float noise, not money. */
const RECONCILE_EPSILON_CENTS = 1e-6;

export interface SpendCapDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  readonly now?: () => Date;
}

/** What `reserve` charged, and against which day item — `reconcile` corrects that same item even
 *  if the turn finished after midnight UTC. */
export interface SpendReservation {
  readonly key: string;
  readonly reservedCents: number;
}

export interface SpendCap {
  /** Throws `OverBudgetError` when `estimatedCostCents` would push the user's running UTC-day
   *  total over the $10/day cap; otherwise atomically reserves it against that total. */
  reserve(userId: string, estimatedCostCents: number): Promise<SpendReservation>;
  /** Replaces a reservation with the turn's measured cost (never conditional on the cap: the
   *  money is already spent, so the record must reflect it). */
  reconcile(reservation: SpendReservation, actualCostCents: number): Promise<void>;
}

function dayKey(userId: string, now: Date): string {
  const yyyyMmDd = now.toISOString().slice(0, 10);
  return `USER#${userId}#DAY#${yyyyMmDd}`;
}

/** The next 00:00 UTC after `now` — when the daily cap resets (the Ask screen's paused copy). */
export function nextUtcMidnight(now: Date): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return next.toISOString();
}

export function createSpendCap(deps: SpendCapDeps): SpendCap {
  const { tableName, client } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async reserve(userId, estimatedCostCents) {
      const at = now();
      const ttl = Math.floor(at.getTime() / 1000) + ITEM_TTL_SECONDS;
      const key = dayKey(userId, at);
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: key },
            UpdateExpression: "SET #ttl = :ttl ADD #costCents :inc",
            ConditionExpression: "attribute_not_exists(pk) OR #costCents <= :threshold",
            ExpressionAttributeNames: { "#costCents": "costCents", "#ttl": "ttl" },
            ExpressionAttributeValues: {
              ":inc": estimatedCostCents,
              ":threshold": DAILY_CAP_CENTS - estimatedCostCents,
              ":ttl": ttl,
            },
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          throw new OverBudgetError(userId, nextUtcMidnight(at));
        }
        throw error;
      }
      return { key, reservedCents: estimatedCostCents };
    },

    async reconcile(reservation, actualCostCents) {
      const delta = actualCostCents - reservation.reservedCents;
      if (Math.abs(delta) < RECONCILE_EPSILON_CENTS) return;
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: reservation.key },
          UpdateExpression: "ADD #costCents :delta",
          // Same conditional-write pattern: only ever correct a reservation that exists, never
          // create a stray negative-balance day item.
          ConditionExpression: "attribute_exists(pk)",
          ExpressionAttributeNames: { "#costCents": "costCents" },
          ExpressionAttributeValues: { ":delta": delta },
        }),
      );
    },
  };
}
