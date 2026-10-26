// Search box exact lookups: search.byPermitNumber and search.byTcadId. Read-only; a miss is a
// plain `found: false` carrying the run searched, never a guess.
import { describe, expect, it } from "vitest";
import type { LeadIndex } from "../src/adapters/duckDbParquet.js";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";

const CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const prop = { propertyCid: CID, requestIdentifier: "138273", latitude: 30.31, longitude: -97.7 };

function caller(opts: { noCoords?: boolean } = {}) {
  const permitCalls: (string | undefined)[] = [];
  const index = {
    async indexInfo() {
      return { manifestCid: "m", propertyCount: 1, permitCount: 1, promotedAt: "t" };
    },
    async currentRunId() {
      return "run-3";
    },
    async searchPermits(q: { permitNumber?: string }) {
      permitCalls.push(q.permitNumber);
      return q.permitNumber === "2026-121002 BP" ? [{ propertyCid: CID, openDays: 3 }] : [];
    },
    async searchProperties() {
      return [];
    },
    async getProperty(cid: string) {
      if (cid !== CID) return null;
      return opts.noCoords
        ? { ...prop, latitude: null, longitude: null, permits: [] }
        : { ...prop, permits: [] };
    },
    async getPropertyByRequestIdentifier(id: string) {
      return id === "138273" ? prop : undefined;
    },
    async presentRequestIdentifiers() {
      return new Set<string>();
    },
  } as unknown as LeadIndex;
  return {
    permitCalls,
    api: createCallerFactory(appRouter)({ requestId: "r", leadIndex: index }),
  };
}

describe("search.byPermitNumber", () => {
  it("finds a permit typed with its BP suffix", async () => {
    const { api } = caller();
    const r = await api.search.byPermitNumber({ value: "2026-121002 BP" });
    expect(r).toMatchObject({
      found: true,
      propertyCid: CID,
      lat: 30.31,
      lng: -97.7,
      runId: "run-3",
    });
  });
  it("appends BP when the suffix is omitted", async () => {
    const { api, permitCalls } = caller();
    const r = await api.search.byPermitNumber({ value: "2026-121002" });
    expect(r.found).toBe(true);
    expect(permitCalls[0]).toBe("2026-121002 BP");
  });
  it("answers found: false with the run when the permit is unknown", async () => {
    const { api } = caller();
    expect(await api.search.byPermitNumber({ value: "2026-999999 BP" })).toMatchObject({
      found: false,
      runId: "run-3",
    });
  });
  it("is a miss when the property has no coordinates", async () => {
    const { api } = caller({ noCoords: true });
    expect((await api.search.byPermitNumber({ value: "2026-121002 BP" })).found).toBe(false);
  });
  it("rejects an empty value", async () => {
    const { api } = caller();
    await expect(api.search.byPermitNumber({ value: "  " })).rejects.toThrow();
  });
});

describe("search.byTcadId", () => {
  it("resolves a TCAD account to its property", async () => {
    const { api } = caller();
    expect(await api.search.byTcadId({ value: "138273" })).toMatchObject({
      found: true,
      propertyCid: CID,
    });
  });
  it("is a miss for an unknown account", async () => {
    const { api } = caller();
    expect(await api.search.byTcadId({ value: "1" })).toMatchObject({
      found: false,
      runId: "run-3",
    });
  });
  it("rejects an over-long value", async () => {
    const { api } = caller();
    await expect(api.search.byTcadId({ value: "9".repeat(41) })).rejects.toThrow();
  });
});
