// UI fix (shell top bar, design-review-log rows 3 and 22, `CrmDataChip` / `CrmAppsMenu`): the
// shell's data chip reads the promoted run from `shell.indexInfo`, and the Apps menu reads its
// links from `shell.appLinks`. Written before apps/api/src/routers/shell.ts existed. Exercised as
// a tRPC caller with a fake LeadIndex, never real DynamoDB/S3.
import { afterEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";
import { IndexNotReadyError, type LeadIndex } from "../src/adapters/duckDbParquet.js";

const MANIFEST = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const RUN_ID = "travis-202609-permits-20261021t103516z";

function fakeIndex(overrides: Partial<LeadIndex> = {}): LeadIndex {
  const base: LeadIndex = {
    indexInfo: async () => ({
      manifestCid: MANIFEST,
      propertyCount: 12,
      permitCount: 34,
      promotedAt: "2026-10-21T10:35:16Z",
    }),
    searchProperties: async () => [],
    searchPermits: async () => [],
    presentRequestIdentifiers: async () => new Set<string>(),
    currentRunId: async () => RUN_ID,
    getProperty: async () => null,
    getPropertyByRequestIdentifier: async () => undefined,
  };
  return { ...base, ...overrides };
}

const createCaller = createCallerFactory(appRouter);

describe("shell.indexInfo", () => {
  it("returns the promoted run's manifest CID, run id, promotion time and counts", async () => {
    const caller = createCaller({ requestId: "req-1", leadIndex: fakeIndex() });
    const info = await caller.shell.indexInfo();
    expect(info).toEqual({
      manifestCid: MANIFEST,
      runId: RUN_ID,
      promotedAt: "2026-10-21T10:35:16Z",
      propertyCount: 12,
      permitCount: 34,
      traceId: "req-1",
    });
  });

  it("returns runId null (never a made-up run) when the promoted run has no rows", async () => {
    const caller = createCaller({
      requestId: "req-2",
      leadIndex: fakeIndex({ currentRunId: async () => undefined }),
    });
    const info = await caller.shell.indexInfo();
    expect(info.runId).toBeNull();
    expect(info.manifestCid).toBe(MANIFEST);
  });

  it("maps 'no run promoted yet' to a typed SERVICE_UNAVAILABLE, not a 500", async () => {
    const caller = createCaller({
      requestId: "req-3",
      leadIndex: fakeIndex({
        indexInfo: async () => {
          throw new IndexNotReadyError();
        },
      }),
    });
    await expect(caller.shell.indexInfo()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("fails with a typed error when no LeadIndex is wired", async () => {
    const caller = createCaller({ requestId: "req-4" });
    await expect(caller.shell.indexInfo()).rejects.toBeInstanceOf(TRPCError);
  });
});

describe("shell.appLinks", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads the CountyLens URL from the same EXPLORER_BASE_URL config as the lineage link", async () => {
    process.env.EXPLORER_BASE_URL = "https://countylens.example.test/";
    delete process.env.LANDING_PAGE_URL;
    const caller = createCaller({ requestId: "req-5" });
    const links = await caller.shell.appLinks();
    expect(links.countyLensUrl).toBe("https://countylens.example.test");
    expect(links.landingPageUrl).toBeNull();
  });

  it("returns a null CountyLens URL (no built-in default host) when EXPLORER_BASE_URL is unset", async () => {
    delete process.env.EXPLORER_BASE_URL;
    const caller = createCaller({ requestId: "req-5b" });
    const links = await caller.shell.appLinks();
    expect(links.countyLensUrl).toBeNull();
  });

  it("returns the landing page URL only when it is configured", async () => {
    process.env.LANDING_PAGE_URL = "https://landing.example.test";
    const caller = createCaller({ requestId: "req-6" });
    const links = await caller.shell.appLinks();
    expect(links.landingPageUrl).toBe("https://landing.example.test");
  });
});
