import { afterEach, expect, it, vi } from "vitest";
import { TurnDeadline } from "../packages/hosted-runtime/src/turn-deadline";
import { DynamoLeadStore } from "../packages/lead-domain/src/dynamo";
import { DomainError } from "../packages/contracts/src/index";
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
function clock() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  return {
    over: () => {
      elapsed = 11;
    },
  };
}
it("rejects an over-deadline settled result before the abort timer gets a turn", async () => {
  const time = clock(),
    budget = new TurnDeadline(10);
  try {
    const result = await budget
      .run(async () => {
        time.over();
        return "synthetic-result";
      })
      .then(
        () => ({ accepted: true }),
        (error) => error,
      );
    expect(budget.signal.aborted).toBe(false);
    expect(result).toMatchObject({ code: "QUERY_TIMEOUT" });
  } finally {
    budget.dispose();
  }
});
it("checks the request-local monotonic dispatch gate between internal database awaits even before timer delivery", async () => {
  const time = clock(),
    budget = new TurnDeadline(10);
  let calls = 0;
  const store = new DynamoLeadStore(
    {
      send: async () => {
        calls++;
        time.over();
        return {};
      },
    },
    "synthetic-table",
    () => "2026-10-28T00:00:00.000Z",
  );
  const gate = () => {
    if (budget.remaining() <= 0)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Synthetic request deadline exceeded",
      );
  };
  try {
    const result = await budget
      .run(() =>
        store.create(
          {
            sessionId: "synthetic-session",
            propertyId: "synthetic-property",
            snapshotId: "synthetic-snapshot",
            idempotencyKey: "synthetic-key",
          },
          budget.signal,
          gate,
        ),
      )
      .then(
        () => ({ accepted: true }),
        (error) => error,
      );
    expect(budget.signal.aborted).toBe(false);
    expect(calls).toBe(1);
    expect(result).toMatchObject({ code: "QUERY_TIMEOUT" });
  } finally {
    budget.dispose();
  }
});
