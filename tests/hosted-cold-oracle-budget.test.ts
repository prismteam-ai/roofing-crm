import { afterEach, expect, it, vi } from "vitest";
import {
  createHostedHandler,
  createHostedOracleClient,
  type HostedRuntime,
} from "../apps/api/src/lambda";
import { CONTRACT_VERSION } from "../packages/contracts/src/index";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemorySessionStore } from "../packages/hosted-runtime/src/sessions";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { LeadStore } from "../packages/lead-domain/src/index";
const origin = "https://oracle.example.test";
const health = {
  snapshotId: "synthetic-cold-oracle",
  mode: "synthetic",
  contractVersion: CONTRACT_VERSION,
};
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
function fixture(
  delay: number,
  setup = 0,
  response = () => Response.json(health),
) {
  const leads = new LeadStore(":memory:");
  const access = new AccessService({
    signingKey: "synthetic-cold-budget-signing-key-only",
    reviewCodeDigest: accessCodeDigest("synthetic-review-code"),
    keyVersion: "synthetic",
  });
  const runtime: HostedRuntime = {
    leads,
    quota: new MemoryQuotaStore(),
    sessions: new MemorySessionStore(),
    access: async () => access,
  };
  let calls = 0;
  let signal: AbortSignal | null | undefined;
  const client = createHostedOracleClient(
    origin,
    [origin],
    "synthetic-cookie",
    async (url, init) => {
      calls++;
      expect(new URL(String(url)).origin).toBe(origin);
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toMatchObject({ Cookie: "synthetic-cookie" });
      signal = init?.signal;
      await pause(delay);
      return response();
    },
  );
  const handler = createHostedHandler(
    async () => {
      await pause(setup);
      return runtime;
    },
    () => client,
  );
  return { client, handler, leads, calls: () => calls, signal: () => signal };
}
it("accepts the measured21.134s-equivalent cold response through the actual hosted factory and27s handler", async () => {
  vi.useFakeTimers();
  const f = fixture(21134);
  try {
    const task = f.handler({
      rawPath: "/api/health",
      requestContext: { http: { method: "GET" } },
    });
    const checked = expect(task).resolves.toMatchObject({ statusCode: 200 });
    await vi.advanceTimersByTimeAsync(21133);
    expect(f.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await checked;
    expect(f.calls()).toBe(1);
    // Successful completion disposes the shared request budget; the signal
    // remains live during the read and is cancelled only after the200 result.
    expect(f.signal()?.aborted).toBe(true);
  } finally {
    f.leads.close();
  }
});
it("aborts beyond the hosted26s upstream ceiling without retry or loosening response validation", async () => {
  vi.useFakeTimers();
  const f = fixture(26001);
  try {
    const task = f.client.health();
    const checked = expect(task).rejects.toMatchObject({
      code: "QUERY_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(26000);
    await checked;
    expect(f.calls()).toBe(1);
    expect(f.signal()?.aborted).toBe(true);
  } finally {
    f.leads.close();
  }
});
it("keeps the actual aggregate27s handler cap even when a25s upstream response fits the per-call ceiling after setup", async () => {
  vi.useFakeTimers();
  const f = fixture(25000, 2500);
  try {
    const task = f.handler({
      rawPath: "/api/health",
      requestContext: { http: { method: "GET" } },
    });
    const checked = expect(task).resolves.toMatchObject({
      statusCode: 503,
      body: expect.stringContaining("DEPENDENCY_UNAVAILABLE"),
    });
    await vi.advanceTimersByTimeAsync(27000);
    await checked;
    expect(f.calls()).toBe(1);
  } finally {
    f.leads.close();
  }
});
it("still rejects malformed JSON and invalid health schemas inside the longer cold-response window", async () => {
  vi.useFakeTimers();
  for (const response of [
    () => new Response("invalid-json"),
    () => Response.json({ contractVersion: CONTRACT_VERSION }),
  ]) {
    const f = fixture(21134, 0, response);
    try {
      const checked = expect(f.client.health()).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(21134);
      await checked;
      expect(f.calls()).toBe(1);
    } finally {
      f.leads.close();
    }
  }
});
