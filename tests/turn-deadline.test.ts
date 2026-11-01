import { expect, it } from "vitest";
import { TurnDeadline } from "../packages/hosted-runtime/src/turn-deadline";
import { OracleClient } from "../packages/oracle-client/src/index";
import { answerWithBedrock } from "../packages/agent/src/bedrock";
import { approvedModelResponse } from "./support/retrieval-model";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
const query = {
  snapshotId: "synthetic-shared-deadline",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 1609.344,
};
const data = {
  contractVersion: CONTRACT_VERSION,
  snapshotId: query.snapshotId,
  queryHash: "synthetic-deadline",
  rows: [{ ...nonemptyEvidenceProperty, distanceMeters: 0 }],
  total: 1,
  truncated: false,
  nextCursor: null,
  limitations: [],
};

it("one aggregate budget cannot be restarted by sequential operations and refuses post-deadline dispatch", async () => {
  const turn = new TurnDeadline(100);
  try {
    await turn.run(() => new Promise((resolve) => setTimeout(resolve, 20)));
    await expect(turn.run(() => new Promise(() => {}))).rejects.toThrow(
      "deadline",
    );
    let dispatched = false;
    await expect(
      turn.run(async () => {
        dispatched = true;
      }),
    ).rejects.toThrow("deadline");
    expect(dispatched).toBe(false);
  } finally {
    turn.dispose();
  }
});

it("Oracle HTTP reads honor the shared AbortSignal even when an injected transport ignores cancellation", async () => {
  const controller = new AbortController();
  let observed: AbortSignal | null | undefined;
  const client = new OracleClient(
    "http://127.0.0.1:4310",
    async (_url, init) => {
      observed = init?.signal;
      return new Promise(() => {});
    },
    { timeoutMs: 10000 },
  );
  const task = client.search(query, {
    signal: controller.signal,
    timeoutMs: 5000,
  });
  controller.abort();
  await expect(task).rejects.toThrow("shared deadline");
  expect(observed?.aborted).toBe(true);
});

it("a slow preflight/model leaves only the remaining second-read budget and records one dispatched attempt", async () => {
  let reads = 0,
    dispatches = 0,
    usage = 0;
  const signals: AbortSignal[] = [];
  await expect(
    answerWithBedrock(
      {
        search: async (_q, options) => {
          reads++;
          if (options?.signal) signals.push(options.signal);
          if (reads === 1) {
            await new Promise((resolve) => setTimeout(resolve, 30));
            return data;
          }
          expect(options?.timeoutMs).toBeLessThan(170);
          return new Promise(() => {});
        },
        detail: async () => nonemptyEvidenceProperty,
      },
      {
        converse: async (request, signal) => {
          signals.push(signal);
          await new Promise((resolve) => setTimeout(resolve, 30));
          return approvedModelResponse(request);
        },
      },
      "Find roofing evidence",
      query,
      {
        modelId: "synthetic",
        deadlineMs: 200,
        onDispatch: () => {
          dispatches++;
        },
        onUsage: async () => {
          usage++;
        },
      },
    ),
  ).rejects.toThrow("deadline");
  expect({ reads, dispatches, usage }).toEqual({
    reads: 2,
    dispatches: 1,
    usage: 1,
  });
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

it("a timeout during reservation never becomes a fake provider dispatch", async () => {
  let calls = 0,
    dispatched = 0,
    reserved = false;
  await expect(
    answerWithBedrock(
      {
        search: async () => data,
        detail: async () => nonemptyEvidenceProperty,
      },
      {
        converse: async (request) => {
          calls++;
          return approvedModelResponse(request);
        },
      },
      "Find roofing evidence",
      query,
      {
        modelId: "synthetic",
        deadlineMs: 100,
        beforeConverse: async () => {
          reserved = true;
          return new Promise(() => {});
        },
        onDispatch: () => {
          dispatched++;
        },
      },
    ),
  ).rejects.toThrow("deadline");
  expect({ calls, dispatched, reserved }).toEqual({
    calls: 0,
    dispatched: 0,
    reserved: true,
  });
});
