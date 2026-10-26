// A faithful in-memory stand-in for the `crm-leads` DynamoDB table, used because the repo has no
// DynamoDB Local / Docker-based test setup (existing API tests mock the SDK or use in-memory
// stores). It is NOT a mock of the repo: `leadRepo` runs unchanged against it through the real
// `@aws-sdk/lib-dynamodb` command classes. What it enforces, exactly as DynamoDB does:
//   - TransactWriteItems is all-or-nothing: every item's ConditionExpression is evaluated against
//     the pre-transaction state, and if any fails nothing is written and a
//     TransactionCanceledException carrying per-item CancellationReasons is thrown.
//   - Supported condition terms: attribute_exists(x), attribute_not_exists(x), `x = :v`, `x >= :v`.
//   - Delete is supported inside TransactWriteItems; BatchGetCommand returns the requested keys.
//   - GSI1 (assignee) / GSI2 (status) are sparse: only items carrying the key attribute appear.
// Limitation: JS is single-threaded, so each transaction body is trivially serialisable; this
// proves the repo issues the right conditions, not DynamoDB's own isolation (that is AWS's job).
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

type Item = Record<string, unknown>;
interface Cmd {
  constructor: { name: string };
  input: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Regex capture group `i`; throws if the group did not participate in the match. */
function group(m: RegExpExecArray, i: number): string {
  const v = m[i];
  if (v === undefined) throw new Error(`FakeLeadsTable: regex group ${i} did not match`);
  return v;
}

export class FakeLeadsTable {
  readonly items = new Map<string, Item>();
  readonly batchGets: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly queries: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  readonly transactions: Array<Record<string, any>[]> = []; // eslint-disable-line @typescript-eslint/no-explicit-any

  private static keyOf(pk: unknown, sk: unknown): string {
    return `${String(pk)}\u0000${String(sk)}`;
  }

  /** Cast to the real client type: `send` is the only method the repo uses. */
  client(): DynamoDBDocumentClient {
    return { send: (cmd: Cmd) => this.send(cmd) } as unknown as DynamoDBDocumentClient;
  }

  private evalCondition(
    expr: string | undefined,
    existing: Item | undefined,
    names: Record<string, string> = {},
    values: Record<string, unknown> = {},
  ): boolean {
    if (expr === undefined) return true;
    return expr.split(/\s+AND\s+/).every((term) => {
      let m = /^attribute_not_exists\((#?\w+)\)$/.exec(term.trim());
      if (m)
        return existing === undefined || existing[names[group(m, 1)] ?? group(m, 1)] === undefined;
      m = /^attribute_exists\((#?\w+)\)$/.exec(term.trim());
      if (m)
        return existing !== undefined && existing[names[group(m, 1)] ?? group(m, 1)] !== undefined;
      m = /^(#?\w+)\s*=\s*(:\w+)$/.exec(term.trim());
      if (m)
        return (
          existing !== undefined &&
          existing[names[group(m, 1)] ?? group(m, 1)] === values[group(m, 2)]
        );
      m = /^(#?\w+)\s*>=\s*(:\w+)$/.exec(term.trim());
      if (m) {
        const have = existing?.[names[group(m, 1)] ?? group(m, 1)];
        return have !== undefined && String(have) >= String(values[group(m, 2)]);
      }
      throw new Error(`FakeLeadsTable: unsupported condition term "${term}"`);
    });
  }

  private applyUpdate(
    existing: Item,
    expr: string,
    names: Record<string, string> = {},
    values: Record<string, unknown> = {},
  ): Item {
    const next = { ...existing };
    const body = expr.replace(/^SET\s+/i, "");
    for (const part of body.split(",")) {
      const m = /^\s*(#?\w+)\s*=\s*(:\w+)\s*$/.exec(part);
      if (!m) throw new Error(`FakeLeadsTable: unsupported update "${part}"`);
      next[names[group(m, 1)] ?? group(m, 1)] = values[group(m, 2)];
    }
    return next;
  }

  async send(cmd: Cmd): Promise<Record<string, unknown>> {
    await Promise.resolve();
    const { input } = cmd;
    switch (cmd.constructor.name) {
      case "GetCommand": {
        const item = this.items.get(FakeLeadsTable.keyOf(input.Key.pk, input.Key.sk));
        return item === undefined ? {} : { Item: { ...item } };
      }
      case "TransactWriteCommand": {
        const txItems = input.TransactItems as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
        const reasons = txItems.map((t) => {
          const op = t.Put ?? t.Update ?? t.ConditionCheck ?? t.Delete;
          const key = t.Put ? { pk: t.Put.Item.pk, sk: t.Put.Item.sk } : op.Key;
          const existing = this.items.get(FakeLeadsTable.keyOf(key.pk, key.sk));
          const ok = this.evalCondition(
            op.ConditionExpression,
            existing,
            op.ExpressionAttributeNames,
            op.ExpressionAttributeValues,
          );
          return { Code: ok ? "None" : "ConditionalCheckFailed" };
        });
        if (reasons.some((r) => r.Code !== "None")) {
          throw new TransactionCanceledException({
            message: "Transaction cancelled",
            $metadata: {},
            CancellationReasons: reasons,
          });
        }
        this.transactions.push(txItems);
        for (const t of txItems) {
          if (t.Put) {
            this.items.set(FakeLeadsTable.keyOf(t.Put.Item.pk, t.Put.Item.sk), { ...t.Put.Item });
          } else if (t.Delete) {
            this.items.delete(FakeLeadsTable.keyOf(t.Delete.Key.pk, t.Delete.Key.sk));
          } else if (t.Update) {
            const k = FakeLeadsTable.keyOf(t.Update.Key.pk, t.Update.Key.sk);
            const existing = this.items.get(k) ?? { ...t.Update.Key };
            this.items.set(
              k,
              this.applyUpdate(
                existing,
                t.Update.UpdateExpression,
                t.Update.ExpressionAttributeNames,
                t.Update.ExpressionAttributeValues,
              ),
            );
          }
        }
        return {};
      }
      case "BatchGetCommand": {
        const out: Record<string, Item[]> = {};
        for (const [table, req] of Object.entries(
          input.RequestItems as Record<string, { Keys: Item[] }>,
        )) {
          out[table] = req.Keys.flatMap((k) => {
            const item = this.items.get(FakeLeadsTable.keyOf(k.pk, k.sk));
            return item === undefined ? [] : [{ ...item }];
          });
        }
        this.batchGets.push(input.RequestItems);
        return { Responses: out, UnprocessedKeys: {} };
      }
      case "QueryCommand": {
        const names: Record<string, string> = input.ExpressionAttributeNames ?? {};
        const values: Record<string, unknown> = input.ExpressionAttributeValues ?? {};
        const m = /^(#?\w+)\s*=\s*(:\w+)(?:\s+AND\s+begins_with\(\s*sk\s*,\s*(:\w+)\s*\))?$/.exec(
          String(input.KeyConditionExpression).trim(),
        );
        if (!m) throw new Error("FakeLeadsTable: unsupported KeyConditionExpression");
        const attr = names[group(m, 1)] ?? group(m, 1);
        const want = values[group(m, 2)];
        const skPrefix = m[3] === undefined ? undefined : String(values[m[3]]);
        const sortAttr = input.IndexName === undefined ? "sk" : "createdAt"; // both GSIs sort on createdAt
        let rows = [...this.items.values()].filter(
          (i) => i[attr] === want && (skPrefix === undefined || String(i.sk).startsWith(skPrefix)),
        );
        this.queries.push(input);
        rows.sort((a, b) => String(a[sortAttr]).localeCompare(String(b[sortAttr])));
        if (input.ScanIndexForward === false) rows.reverse();
        if (input.ExclusiveStartKey) {
          const after = FakeLeadsTable.keyOf(
            input.ExclusiveStartKey.pk,
            input.ExclusiveStartKey.sk,
          );
          const idx = rows.findIndex((r) => FakeLeadsTable.keyOf(r.pk, r.sk) === after);
          rows = rows.slice(idx + 1);
        }
        const limit: number | undefined = input.Limit;
        const page = limit === undefined ? rows : rows.slice(0, limit);
        const last = page[page.length - 1];
        return {
          Items: page.map((r) => ({ ...r })),
          ...(limit !== undefined && rows.length > limit && last
            ? {
                LastEvaluatedKey: {
                  pk: last.pk,
                  sk: last.sk,
                  [attr]: last[attr],
                  createdAt: last.createdAt,
                },
              }
            : {}),
        };
      }
      default:
        throw new Error(`FakeLeadsTable: unsupported command ${cmd.constructor.name}`);
    }
  }
}
