import { afterEach, expect, it, vi } from "vitest";
import { DynamoLeadStore } from "../packages/lead-domain/src/dynamo";
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const at = "2026-10-28T00:00:00.000Z";
const input = {
  sessionId: "synthetic-session",
  propertyId: "synthetic-property",
  snapshotId: "synthetic-snapshot",
  idempotencyKey: "synthetic-idempotency",
};
const lead = {
  id: "synthetic-lead",
  sessionId: input.sessionId,
  propertyId: input.propertyId,
  snapshotId: input.snapshotId,
  version: 1,
  status: "new",
  events: [{ kind: "created", at }],
};
const old = { lead, version: 1, expiresAt: Date.parse(at) / 1000 + 86400 };
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
for (const scenario of [
  "create-first-get",
  "create-alias",
  "create-conflict-resolve",
  "update-put",
  "list-page",
] as const) {
  it(`refuses new ${scenario} dispatches after an earlier transport ignores cancellation`, async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const calls: string[] = [];
    const store = new DynamoLeadStore(
      {
        send: async (command) => {
          const kind = command.constructor.name;
          calls.push(kind);
          if (scenario === "create-first-get" && calls.length === 1) {
            await pause(20);
            return {};
          }
          if (scenario === "create-alias" && calls.length === 2) {
            await pause(20);
            return { Item: old };
          }
          if (
            scenario === "create-conflict-resolve" &&
            kind === "TransactWriteCommand"
          ) {
            await pause(20);
            throw Object.assign(new Error("synthetic-only"), {
              name: "TransactionCanceledException",
            });
          }
          if (scenario === "update-put" && kind === "GetCommand") {
            await pause(20);
            return { Item: old };
          }
          if (scenario === "list-page" && calls.length === 1) {
            await pause(20);
            return {
              Items: [],
              LastEvaluatedKey: { pk: "synthetic-next", sk: "synthetic-next" },
            };
          }
          return {};
        },
      },
      "synthetic-table",
      () => at,
    );
    const task =
      scenario === "update-put"
        ? store.update(
            lead.id,
            {
              sessionId: input.sessionId,
              expectedVersion: 1,
              status: "qualified",
            },
            controller.signal,
          )
        : scenario === "list-page"
          ? store.list(input.sessionId, controller.signal)
          : store.create(input, controller.signal);
    // Attach rejection handling before the virtual deadline advances.
    const settled = task.then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(20);
    const expected =
      scenario === "create-conflict-resolve"
        ? 3
        : scenario === "create-alias"
          ? 2
          : 1;
    expect(calls).toHaveLength(expected);
    expect(calls.slice(expected)).toEqual([]);
    expect(await settled).toBe("rejected");
  });
}
