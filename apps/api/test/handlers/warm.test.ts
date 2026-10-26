// Keep-warm: an EventBridge schedule invokes crm-api-trpc every 5 minutes with { source:
// "crm.warm" }. The handler only runs the index load/ping: no auth, no tRPC, no data returned,
// one Powertools metric (WarmPings). Also: the module-init warm-up never throws.
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadIndex } from "../../src/adapters/duckDbParquet.js";
import { handler, isWarmEvent, warmIndexAtInit } from "../../src/handlers/health.js";
import { setLeadIndexForTest } from "../../src/leadIndex.js";

const context = { awsRequestId: "warm-test" } as Context;
const warmEvent = { source: "crm.warm" } as const;

function indexWith(warm: LeadIndex["warm"]): LeadIndex {
  return { warm } as unknown as LeadIndex;
}

afterEach(() => setLeadIndexForTest(undefined));

describe("isWarmEvent", () => {
  it("accepts only the exact internal event", () => {
    expect(isWarmEvent({ source: "crm.warm" })).toBe(true);
    expect(isWarmEvent({ source: "aws.events" })).toBe(false);
    expect(isWarmEvent({ version: "2.0", routeKey: "GET /trpc/health.ping" })).toBe(false);
    expect(isWarmEvent(null)).toBe(false);
    expect(isWarmEvent("crm.warm")).toBe(false);
  });
});

describe("handler on the keep-warm event", () => {
  it("loads the index, returns no data, and never reaches tRPC or auth", async () => {
    const warm = vi.fn(async () => ({ manifestCid: "bafy-secret-cid" }));
    setLeadIndexForTest(indexWith(warm));
    const result = await handler(warmEvent, context);
    expect(warm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ warmed: true });
    expect(JSON.stringify(result)).not.toContain("bafy");
  });

  it("answers { warmed: false } and does not throw when the load fails (no promoted run yet)", async () => {
    setLeadIndexForTest(
      indexWith(async () => {
        throw new Error("no run");
      }),
    );
    await expect(handler(warmEvent, context)).resolves.toEqual({ warmed: false });
  });

  it("answers { warmed: false } when the index is not configured", async () => {
    setLeadIndexForTest(undefined);
    await expect(handler(warmEvent, context)).resolves.toEqual({ warmed: false });
  });
});

describe("warmIndexAtInit", () => {
  it("starts the load and waits for it up to the init budget", async () => {
    const warm = vi.fn(async () => ({ manifestCid: "m" }));
    setLeadIndexForTest(indexWith(warm));
    await warmIndexAtInit(1_000);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("returns at the init budget while the load carries on", async () => {
    let finish!: () => void;
    const warm = vi.fn(
      () =>
        new Promise<{ manifestCid: string }>((resolve) => {
          finish = () => resolve({ manifestCid: "m" });
        }),
    );
    setLeadIndexForTest(indexWith(warm));
    const started = Date.now();
    await warmIndexAtInit(30);
    expect(Date.now() - started).toBeLessThan(500);
    finish();
  });

  it("never throws: a failing load or a missing index is a no-op", async () => {
    setLeadIndexForTest(
      indexWith(async () => {
        throw new Error("boom");
      }),
    );
    await expect(warmIndexAtInit(100)).resolves.toBeUndefined();
    setLeadIndexForTest(undefined);
    await expect(warmIndexAtInit(100)).resolves.toBeUndefined();
  });
});
