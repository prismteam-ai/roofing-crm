import { type DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

/** Per-IP request limit and a daily token budget for the public agent. */
export interface BudgetGuard {
  /** null when allowed, else the friendly reason it is not. Counts the request. */
  allow(ip: string): Promise<string | null>;
  record(tokens: number): Promise<void>;
}

export interface BudgetLimits {
  requestsPerIpPerMinute: number;
  dailyTokens: number;
}

export const DEFAULT_LIMITS: BudgetLimits = { requestsPerIpPerMinute: 10, dailyTokens: 2_000_000 };

const day = (now: Date) => now.toISOString().slice(0, 10);
const minute = (now: Date) => now.toISOString().slice(0, 16);
const ipLimitMsg =
  "You have asked a lot of questions in the last minute. Please wait a moment and try again.";
const budgetMsg =
  "The assistant has used today's question budget. It resets at midnight UTC; the map and leads keep working.";

export function memoryBudget(limits: BudgetLimits = DEFAULT_LIMITS, clock = () => new Date()): BudgetGuard {
  const ips = new Map<string, number>();
  const tokens = new Map<string, number>();
  return {
    async allow(ip) {
      const now = clock();
      if ((tokens.get(day(now)) ?? 0) >= limits.dailyTokens) return budgetMsg;
      const k = `${ip}#${minute(now)}`;
      const n = (ips.get(k) ?? 0) + 1;
      ips.set(k, n);
      return n > limits.requestsPerIpPerMinute ? ipLimitMsg : null;
    },
    async record(t) {
      const k = day(clock());
      tokens.set(k, (tokens.get(k) ?? 0) + t);
    },
  };
}

/** Counters in the leads table (pk `AGENT#<day>`), expiring via its TTL attribute. */
export function dynamoBudget(opts: {
  doc: DynamoDBDocumentClient;
  tableName: string;
  limits?: BudgetLimits;
  clock?: () => Date;
}): BudgetGuard {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const clock = opts.clock ?? (() => new Date());
  const add = async (sk: string, by: number, ttlDays: number) => {
    const now = clock();
    const r = await opts.doc.send(
      new UpdateCommand({
        TableName: opts.tableName,
        Key: { pk: `AGENT#${day(now)}`, sk },
        UpdateExpression: "ADD #n :by SET expiresAt = if_not_exists(expiresAt, :exp)",
        ExpressionAttributeNames: { "#n": "n" },
        ExpressionAttributeValues: { ":by": by, ":exp": Math.floor(now.getTime() / 1000) + ttlDays * 86_400 },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return Number(r.Attributes?.n ?? 0);
  };
  return {
    async allow(ip) {
      if ((await add("TOKENS", 0, 2)) >= limits.dailyTokens) return budgetMsg;
      const n = await add(`IP#${ip}#${minute(clock())}`, 1, 1);
      return n > limits.requestsPerIpPerMinute ? ipLimitMsg : null;
    },
    async record(t) {
      if (t > 0) await add("TOKENS", t, 2);
    },
  };
}
