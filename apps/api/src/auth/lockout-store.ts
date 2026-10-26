// The DynamoDB adapter for data-model.md's `LockoutCounter` table (`CrmOps` stack, T017). Split
// out from lockout-handler.ts so the state-machine logic (T011/T018) is unit-testable against an
// in-memory fake, with the real adapter exercised only by cdk-nag/integration, not by vitest.
import { DynamoDBClient, type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";

export const LockoutCounter = z.object({
  username: z.string().min(1),
  failedAttempts: z.number().int().nonnegative(),
  /** Epoch milliseconds, or null when not locked (data-model.md). */
  lockedUntil: z.number().int().positive().nullable(),
});
export type LockoutCounter = z.infer<typeof LockoutCounter>;

export interface LockoutStore {
  get(username: string): Promise<LockoutCounter | undefined>;
  put(counter: LockoutCounter): Promise<void>;
}

export function createDynamoLockoutStore(
  tableName: string,
  clientConfig: DynamoDBClientConfig = {},
): LockoutStore {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
  return {
    async get(username) {
      const result = await client.send(new GetCommand({ TableName: tableName, Key: { username } }));
      if (result.Item === undefined) return undefined;
      // A malformed item (a partially-written row from a failed put, or manual tampering) must
      // not silently defeat the lock: `{...}.failedAttempts + 1` on a bad shape could produce
      // NaN, and `NaN >= MAX_FAILED_ATTEMPTS` is always false (found in code review, CR-B-01).
      // Treat it as absent instead — the caller's `?? emptyCounter(username)` fallback then
      // starts counting cleanly from 0 rather than failing open on a corrupt value.
      const parsed = LockoutCounter.safeParse(result.Item);
      return parsed.success ? parsed.data : undefined;
    },
    async put(counter) {
      await client.send(new PutCommand({ TableName: tableName, Item: counter }));
    },
  };
}

/** An in-memory `LockoutStore` for unit tests (T011) — no network, no AWS credentials needed. */
export function createInMemoryLockoutStore(seed: readonly LockoutCounter[] = []): LockoutStore {
  const table = new Map<string, LockoutCounter>(seed.map((c) => [c.username, c]));
  return {
    async get(username) {
      return table.get(username);
    },
    async put(counter) {
      table.set(counter.username, counter);
    },
  };
}
