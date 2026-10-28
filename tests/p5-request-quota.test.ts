import { it, expect } from "vitest";
import { CAMPAIGN_LIMITS } from "../packages/agent/src/campaign";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";
import { consumeHostedRequestQuota } from "../packages/hosted-runtime/src/request-quota";
it("enforces session40 and endpoint daily160 across sessions without consuming/resetting the prior phase bucket", async () => {
  const store = new MemoryQuotaStore(),
    now = Date.parse("2026-10-28T06:00:00Z");
  await store.consume({
    subject: "global-model-budget",
    category: "model",
    limit: 60,
    units: 60,
    windowSeconds: 86400,
    nowMs: now,
  });
  const first = await Promise.allSettled(
    Array.from({ length: 44 }, () =>
      consumeHostedRequestQuota(store, "session-one", "model", now),
    ),
  );
  expect(first.filter((x) => x.status === "fulfilled")).toHaveLength(40);
  for (let i = 0; i < 40; i++)
    await consumeHostedRequestQuota(store, "session-two", "model", now);
  for (let i = 0; i < 40; i++)
    await consumeHostedRequestQuota(store, "session-three", "model", now);
  for (let i = 0; i < 40; i++)
    await consumeHostedRequestQuota(store, "session-four", "model", now);
  expect(CAMPAIGN_LIMITS).toMatchObject({
    requestsTotal: 100,
    requestsPerDay: 100,
    converseTotal: 100,
    conversePerDay: 80,
    modelMicroUsd: 3000000,
  });
  await expect(
    consumeHostedRequestQuota(store, "fresh-session", "model", now),
  ).rejects.toThrow("allowance");
  await expect(
    store.consume({
      subject: "global-model-budget",
      category: "model",
      limit: 60,
      windowSeconds: 86400,
      nowMs: now,
    }),
  ).rejects.toThrow("allowance");
});
