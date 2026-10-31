import { afterEach, expect, it, vi } from "vitest";
import {
  createHostedHandler,
  type HostedRuntime,
} from "../apps/api/src/lambda";
import {
  AccessService,
  accessCodeDigest,
} from "../packages/hosted-runtime/src/access";
import { MemoryQuotaStore } from "../packages/hosted-runtime/src/quota";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
for (const stage of ["access", "detail"] as const) {
  it(`never dispatches a lead mutation after ${stage} completes beyond the aggregate deadline`, async () => {
    vi.useFakeTimers();
    const access = new AccessService({
      signingKey: "synthetic-independent-setup-key-only-32",
      reviewCodeDigest: accessCodeDigest("synthetic-code"),
      keyVersion: "synthetic",
    });
    const issued = access.issue("synthetic-code");
    let writes = 0;
    const runtime: HostedRuntime = {
      leads: {
        list: async () => [],
        create: async () => {
          writes++;
          return {} as never;
        },
        update: async () => {
          throw Error("UNUSED");
        },
      },
      quota: new MemoryQuotaStore(),
      sessions: {
        get: async () => issued.session,
        put: async () => {},
        revoke: async () => {},
      },
      access: async () => {
        if (stage === "access") await pause(20);
        return access;
      },
    };
    const handler = createHostedHandler(
      () => runtime,
      () => ({
        search: async () => {
          throw Error("UNUSED");
        },
        detail: async () => {
          if (stage === "detail") await pause(20);
          return {} as never;
        },
      }),
      undefined,
      Date.now,
      10,
    );
    const task = handler({
      rawPath: "/api/leads",
      requestContext: { http: { method: "POST" } },
      cookies: [`prism_review=${issued.token}`],
      body: JSON.stringify({
        propertyId: "SYNTHETIC-PROPERTY",
        snapshotId: "SYNTHETIC-SNAPSHOT",
        idempotencyKey: "SYNTHETIC-IDEMPOTENCY",
      }),
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await task).toMatchObject({
      statusCode: 503,
      body: expect.stringContaining("DEPENDENCY_UNAVAILABLE"),
    });
    await vi.advanceTimersByTimeAsync(30);
    expect(writes).toBe(0);
  });
}
