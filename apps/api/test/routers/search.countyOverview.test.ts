// search.countyOverview as a tRPC caller (createCallerFactory) with a fake LeadIndex in the
// context: Zod bounds, the typed not-ready mapping, traceId, and the service's pass-through of
// filters. The DuckDB aggregate itself is proven in ../countyOverview.test.ts.
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type {
  CountyOverview,
  CountyOverviewQuery,
  LeadIndex,
} from "../../src/adapters/duckDbParquet.js";
import { IndexNotReadyError } from "../../src/adapters/duckDbParquet.js";
import { appRouter } from "../../src/routers/index.js";
import { createCallerFactory } from "../../src/trpc.js";

const MANIFEST = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";

const OVERVIEW: CountyOverview = {
  zoom: 9,
  agedYears: 15,
  cells: [
    {
      q: -29,
      r: 1499,
      lat: 30.26,
      lng: -97.74,
      count: 3,
      withRoofAge: 2,
      medianRoofAge: 15.5,
      agedCount: 1,
    },
  ],
  counts: {
    total: 4,
    matched: 4,
    binned: 3,
    excludedNoCoordinates: 1,
    excludedNoRoofDate: 0,
    binnedWithoutRoofAge: 1,
  },
  manifestCid: MANIFEST,
  runId: "travis-202609-permits-20261021t103516z",
};

function fakeIndex(behaviour: "ok" | "not-ready" | "no-overview"): {
  index: LeadIndex;
  calls: CountyOverviewQuery[];
} {
  const calls: CountyOverviewQuery[] = [];
  const index: LeadIndex = {
    indexInfo: async () => {
      if (behaviour === "not-ready") throw new IndexNotReadyError();
      return { manifestCid: MANIFEST, propertyCount: 4, permitCount: 0, promotedAt: "" };
    },
    searchProperties: async () => [],
    searchPermits: async () => [],
    getProperty: async () => null,
    getPropertyByRequestIdentifier: async () => undefined,
    presentRequestIdentifiers: async () => new Set<string>(),
    currentRunId: async () => undefined,
    ...(behaviour === "no-overview"
      ? {}
      : {
          countyOverview: async (query: CountyOverviewQuery) => {
            calls.push(query);
            if (behaviour === "not-ready") throw new IndexNotReadyError();
            return OVERVIEW;
          },
        }),
  };
  return { index, calls };
}

const createCaller = createCallerFactory(appRouter);

describe("search.countyOverview", () => {
  it("returns the cells, counts and provenance with a traceId", async () => {
    const { index, calls } = fakeIndex("ok");
    const caller = createCaller({ requestId: "req-1", leadIndex: index });
    const result = await caller.search.countyOverview({ zoom: 9 });
    expect(result).toMatchObject({ ...OVERVIEW, traceId: "req-1" });
    expect(calls).toEqual([{ zoom: 9 }]);
  });

  it("passes only the filters that were set", async () => {
    const { index, calls } = fakeIndex("ok");
    const caller = createCaller({ requestId: "req-2", leadIndex: index });
    await caller.search.countyOverview({
      zoom: 8,
      roofAgeMinYears: 15,
      propertyUsageType: "residential",
      permits: true,
      permitStatus: "open",
      permitOpenDaysMin: 365,
    });
    expect(calls).toEqual([
      {
        zoom: 8,
        roofAgeMinYears: 15,
        propertyUsageType: "residential",
        permits: true,
        permitStatus: "open",
        permitOpenDaysMin: 365,
      },
    ]);
  });

  it("rejects a zoom at or above the marker zoom, a fractional zoom, and a negative roof age", async () => {
    const caller = createCaller({ requestId: "req-3", leadIndex: fakeIndex("ok").index });
    await expect(caller.search.countyOverview({ zoom: 11 })).rejects.toThrow(TRPCError);
    await expect(caller.search.countyOverview({ zoom: 9.5 })).rejects.toThrow(TRPCError);
    await expect(caller.search.countyOverview({ zoom: -1 })).rejects.toThrow(TRPCError);
    await expect(caller.search.countyOverview({ zoom: 9, roofAgeMinYears: -1 })).rejects.toThrow(
      TRPCError,
    );
  });

  it("answers SERVICE_UNAVAILABLE, not a bare 500, when no run has been promoted", async () => {
    const caller = createCaller({ requestId: "req-4", leadIndex: fakeIndex("not-ready").index });
    await expect(caller.search.countyOverview({ zoom: 9 })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("answers a typed error when the wired index has no overview", async () => {
    const caller = createCaller({ requestId: "req-5", leadIndex: fakeIndex("no-overview").index });
    await expect(caller.search.countyOverview({ zoom: 9 })).rejects.toMatchObject({
      code: "NOT_IMPLEMENTED",
    });
  });
});
