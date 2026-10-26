// CR finding 6b: per-thread agent state, so `agent.confirmLead` only confirms a tcadId the agent
// actually proposed in that `threadId`, to the rep who owns the thread. Also keeps the thread's
// last `QueryPlan` (small: one Zod-validated object) for follow-up inheritance (contracts/
// agent-api.md step 2, ADR-06 §6.3) — written by `recordTurn`, read back by `lastPlan` before the
// next turn's plan call (agent/composeAnswer.ts applies the inheritance).
//
// Storage: one prefixed item `pk = THREAD#{threadId}` in the existing `crm-agent-usage` table.
// data-model.md's ConversationEventStore layout (`PK=THREAD#…`, `SK=EVT#{ordinal}`) needs a sort
// key that table doesn't have (it is `pk`-only, infra/lib/crm-data-stack.ts); data-model.md lets
// the review records share that table, so this keeps the same `THREAD#` prefix and 7-day TTL as
// one item per thread instead of one per event. `actorId` (Cognito sub) is fixed by the first
// write — a later write from another user fails the condition, so a guessed threadId can't be
// used to plant or read someone else's proposals.
import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { QueryPlan as QueryPlanSchema, type QueryPlan } from "@crm/shared";
import { isConditionalCheckFailed } from "../agentErrors.js";

/** 7 days — data-model.md "conversation memory" TTL. */
export const THREAD_TTL_SECONDS = 7 * 24 * 60 * 60;

export class ThreadOwnedByAnotherUserError extends Error {
  readonly code = "THREAD_OWNED_BY_ANOTHER_USER";
  constructor() {
    super("This threadId belongs to another user");
    this.name = "ThreadOwnedByAnotherUserError";
  }
}

export interface ThreadTurn {
  readonly plan: QueryPlan;
  readonly proposedTcadIds: readonly string[];
}

export interface ThreadStore {
  recordTurn(threadId: string, actorId: string, turn: ThreadTurn): Promise<void>;
  wasProposed(threadId: string, actorId: string, tcadId: string): Promise<boolean>;
  /** The subset of `tcadIds` proposed in this thread to this actor, from one consistent read
   *  (`agent.confirmLeads` checks a whole batch against a single item). */
  proposedAmong(
    threadId: string,
    actorId: string,
    tcadIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  /** The thread's last recorded plan, for its owner only; undefined for a new thread, another
   *  user's thread, or a stored plan that no longer parses as the current `QueryPlan`. */
  lastPlan(threadId: string, actorId: string): Promise<QueryPlan | undefined>;
}

export interface ThreadStoreDeps {
  readonly tableName: string;
  readonly client: DynamoDBDocumentClient;
  readonly now?: () => Date;
}

function threadKey(threadId: string): string {
  return `THREAD#${threadId}`;
}

export function createThreadStore(deps: ThreadStoreDeps): ThreadStore {
  const { tableName, client } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async recordTurn(threadId, actorId, turn) {
      const at = now();
      const proposed = [...new Set(turn.proposedTcadIds)];
      const values: Record<string, unknown> = {
        ":actor": actorId,
        ":lastPlan": turn.plan,
        ":updatedAt": at.toISOString(),
        ":ttl": Math.floor(at.getTime() / 1000) + THREAD_TTL_SECONDS,
      };
      let update =
        "SET actorId = :actor, lastPlan = :lastPlan, updatedAt = :updatedAt, #ttl = :ttl";
      // A DynamoDB string set can't be empty — only ADD when this turn proposed something.
      if (proposed.length > 0) {
        update += " ADD proposedTcadIds :proposed";
        values[":proposed"] = new Set(proposed);
      }
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { pk: threadKey(threadId) },
            UpdateExpression: update,
            ConditionExpression: "attribute_not_exists(pk) OR actorId = :actor",
            ExpressionAttributeNames: { "#ttl": "ttl" },
            ExpressionAttributeValues: values,
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) throw new ThreadOwnedByAnotherUserError();
        throw error;
      }
    },

    async proposedAmong(threadId, actorId, tcadIds) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: threadKey(threadId) },
          ConsistentRead: true,
          ProjectionExpression: "actorId, proposedTcadIds",
        }),
      );
      if (Item === undefined || Item.actorId !== actorId) return new Set<string>();
      const proposed: unknown = Item.proposedTcadIds;
      if (!(proposed instanceof Set)) return new Set<string>();
      return new Set(tcadIds.filter((id) => proposed.has(id)));
    },

    async wasProposed(threadId, actorId, tcadId) {
      return (await this.proposedAmong(threadId, actorId, [tcadId])).has(tcadId);
    },

    async lastPlan(threadId, actorId) {
      const { Item } = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { pk: threadKey(threadId) },
          ConsistentRead: true,
          ProjectionExpression: "actorId, lastPlan",
        }),
      );
      if (Item === undefined || Item.actorId !== actorId) return undefined;
      const parsed = QueryPlanSchema.safeParse(Item.lastPlan);
      return parsed.success ? parsed.data : undefined;
    },
  };
}
