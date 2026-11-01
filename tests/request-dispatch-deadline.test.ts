import { afterEach, expect, it, vi } from "vitest";
import { TurnDeadline } from "../packages/hosted-runtime/src/turn-deadline";
import { requestBoundaries } from "../packages/hosted-runtime/src/request-boundaries";
import { consumeHostedRequestQuota } from "../packages/hosted-runtime/src/request-quota";
import { DynamoLeadStore } from "../packages/lead-domain/src/dynamo";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import {
  createHostedHandler,
  type HostedRuntime,
} from "../apps/api/src/lambda";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import {
  MemoryCampaignStore,
  type VerifiedPrice,
} from "../packages/agent/src/campaign";
import { MICRO_MODEL } from "../packages/runtime-config/src/index";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
import { approvedModelResponse } from "./support/retrieval-model";
import { verifiedPriceProvider } from "../packages/agent/src/prices";
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
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
const oracle = {
  search: async () => {
    throw Error("UNUSED");
  },
  detail: async () => nonemptyEvidenceProperty,
};
it("checks elapsed monotonic time again after awaited work, even before the abort timer runs", async () => {
  let elapsed = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const budget = new TurnDeadline(10);
  try {
    await expect(
      budget.run(async () => {
        elapsed = 11;
        return "late";
      }),
    ).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(budget.signal.aborted).toBe(false);
    let calls = 0;
    await expect(
      budget.run(async () => {
        calls++;
      }),
    ).rejects.toThrow("deadline");
    expect(calls).toBe(0);
  } finally {
    budget.dispose();
  }
});
for (const scenario of [
  "create-first-get",
  "create-alias",
  "create-conflict-resolve",
  "update-put",
  "list-page",
] as const) {
  it(`checks the same absolute deadline at each internal ${scenario} command without relying on timer delivery`, async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const budget = new TurnDeadline(10),
      calls: string[] = [];
    const store = new DynamoLeadStore(
      {
        send: async (command) => {
          const kind = command.constructor.name;
          calls.push(kind);
          if (scenario === "create-first-get" && calls.length === 1) {
            elapsed = 11;
            return {};
          }
          if (scenario === "create-alias" && calls.length === 2) {
            elapsed = 11;
            return { Item: old };
          }
          if (
            scenario === "create-conflict-resolve" &&
            kind === "TransactWriteCommand"
          ) {
            elapsed = 11;
            throw Object.assign(Error("synthetic"), {
              name: "TransactionCanceledException",
            });
          }
          if (scenario === "update-put") {
            elapsed = 11;
            return { Item: old };
          }
          if (scenario === "list-page") {
            elapsed = 11;
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
    const bounded = requestBoundaries(
      budget,
      oracle,
      store,
      new MemoryQuotaStore(),
    ).leads;
    try {
      await expect(
        scenario === "update-put"
          ? bounded.update(lead.id, {
              sessionId: input.sessionId,
              expectedVersion: 1,
              status: "qualified",
            })
          : scenario === "list-page"
            ? bounded.list(input.sessionId)
            : bounded.create(input),
      ).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
      expect(calls).toHaveLength(
        scenario === "create-conflict-resolve"
          ? 3
          : scenario === "create-alias"
            ? 2
            : 1,
      );
      expect(budget.signal.aborted).toBe(false);
    } finally {
      budget.dispose();
    }
  });
}
it("a late first model-quota read cannot launch the second global reservation", async () => {
  let elapsed = 0,
    calls = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const budget = new TurnDeadline(10);
  const bounded = requestBoundaries(budget, oracle, {} as never, {
    consume: async () => {
      calls++;
      elapsed = 11;
      return { remaining: 1, resetAt: 1 };
    },
  });
  try {
    await expect(
      consumeHostedRequestQuota(
        bounded.quota,
        "synthetic",
        "model",
        Date.now(),
      ),
    ).rejects.toThrow("deadline");
    expect(calls).toBe(1);
  } finally {
    budget.dispose();
  }
});
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const price: VerifiedPrice = {
  modelId: MICRO_MODEL,
  region: "us-east-2",
  inputUsdPerMillion: 0.035,
  outputUsdPerMillion: 0.14,
  verifiedAt: at,
  priceListSha256: "a".repeat(64),
  source: "https://aws.amazon.com/bedrock/pricing/",
};
for (const stage of [
  "runtime",
  "session",
  "authorize",
  "request-reservation",
  "price",
  "converse-reservation",
] as const) {
  it(`late ${stage} completion never starts a new provider call or downstream reservation`, async () => {
    vi.useFakeTimers();
    const access = new AccessService({
      signingKey: "synthetic-dispatch-budget-signing-key-only",
      reviewCodeDigest: accessCodeDigest("synthetic-code"),
      keyVersion: "synthetic",
    });
    const issued = access.issue("synthetic-code");
    const campaign = new MemoryCampaignStore();
    let calls = 0,
      requests = 0,
      reservations = 0,
      prices = 0;
    const runtime: HostedRuntime = {
      access: async () => access,
      leads: {} as never,
      quota: new MemoryQuotaStore(),
      sessions: {
        get: async () => {
          if (stage === "session") await pause(6000);
          return issued.session;
        },
        put: async () => {},
        revoke: async () => {},
      },
      campaign: {
        authorize: async (...args) => {
          if (stage === "authorize") await pause(6000);
          return campaign.authorize(...args);
        },
        reserve: async (value, signal) => {
          if (value.kind === "request") {
            requests++;
            if (stage === "request-reservation") await pause(6000);
          } else {
            reservations++;
            if (stage === "converse-reservation") await pause(6000);
          }
          return campaign.reserve(value, signal);
        },
        record: (...args) => campaign.record(...args),
      },
      price: async () => {
        prices++;
        if (stage === "price") await pause(6000);
        return { ...price, verifiedAt: new Date(Date.now()).toISOString() };
      },
      provider: {
        converse: async (request) => {
          calls++;
          return approvedModelResponse(request);
        },
      },
    };
    const query = {
      snapshotId: input.snapshotId,
      lat: 42.66,
      lng: -83.29,
      radiusMeters: 1609.344,
    };
    const handler = createHostedHandler(
      async () => {
        if (stage === "runtime") await pause(6000);
        return runtime;
      },
      () => ({
        search: async () => ({
          contractVersion: CONTRACT_VERSION,
          snapshotId: query.snapshotId,
          queryHash: "synthetic",
          total: 1,
          rows: [{ ...nonemptyEvidenceProperty, distanceMeters: 0 }],
          truncated: false,
          nextCursor: null,
          limitations: [],
        }),
        detail: oracle.detail,
      }),
      () => MICRO_MODEL,
      Date.now,
      5000,
    );
    const task = handler({
      rawPath: "/api/agent",
      requestContext: { http: { method: "POST" } },
      cookies: [`prism_review=${issued.token}`],
      body: JSON.stringify({ prompt: "Find roofing evidence", query }),
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect([200, 503]).toContain((await task).statusCode);
    await vi.advanceTimersByTimeAsync(12000);
    expect(calls).toBe(0);
    expect(reservations).toBe(stage === "converse-reservation" ? 1 : 0);
    expect(prices).toBe(
      ["price", "converse-reservation"].includes(stage) ? 1 : 0,
    );
    expect(requests).toBe(
      ["runtime", "session", "authorize"].includes(stage) ? 0 : 1,
    );
  });
}
it("an expired stored-price read cannot start the public metadata fallback", async () => {
  const controller = new AbortController();
  let fetches = 0;
  const read = verifiedPriceProvider(
    MICRO_MODEL,
    async () => {
      controller.abort();
      return {};
    },
    async () => {
      fetches++;
      throw Error("UNUSED");
    },
  );
  await expect(read(controller.signal)).rejects.toMatchObject({
    code: "QUERY_TIMEOUT",
  });
  expect(fetches).toBe(0);
});
it("a timer-starved stored-price completion still cannot dispatch fallback metadata", async () => {
  let elapsed = 0,
    fetches = 0;
  vi.spyOn(performance, "now").mockImplementation(() => elapsed);
  const budget = new TurnDeadline(10);
  const read = verifiedPriceProvider(
    MICRO_MODEL,
    async () => {
      elapsed = 11;
      return {};
    },
    async () => {
      fetches++;
      throw Error("UNUSED");
    },
  );
  try {
    await expect(
      read(budget.signal, () => budget.assertActive()),
    ).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
    expect(budget.signal.aborted).toBe(false);
    expect(fetches).toBe(0);
  } finally {
    budget.dispose();
  }
});
it("memory sessions and quotas reject preexpired operations before mutation", async () => {
  const controller = new AbortController();
  controller.abort();
  const sessions = new MemorySessionStore();
  const session = {
    id: "synthetic",
    workspaceId: "review" as const,
    expiresAt: 9999999999,
  };
  await expect(sessions.put(session, controller.signal)).rejects.toThrow(
    "deadline",
  );
  expect(await sessions.get(session.id)).toBeNull();
  await sessions.put(session);
  await expect(sessions.revoke(session.id, controller.signal)).rejects.toThrow(
    "deadline",
  );
  expect(await sessions.get(session.id)).toEqual(session);
  const quota = new MemoryQuotaStore(),
    q = {
      subject: "synthetic",
      category: "read" as const,
      limit: 1,
      windowSeconds: 60,
      nowMs: 0,
    };
  await expect(quota.consume(q, controller.signal)).rejects.toThrow("deadline");
  expect(await quota.consume(q)).toMatchObject({ remaining: 0 });
});
