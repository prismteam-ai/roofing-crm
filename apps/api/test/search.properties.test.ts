// T006 (B-03, US1): written and shown failing before apps/api/src/routers/search.ts exists.
// Exercises search.properties directly as a tRPC caller (createCallerFactory), injecting a fake
// LeadIndex directly into the tRPC context (trpc.ts's TrpcContext.leadIndex) so this never
// reaches real DynamoDB/S3 — the real adapter's own behavior is already proven in query.test.ts.
// Per data-model.md: radiusMi MUST be within 0.5-25 inclusive, a Zod validation error outside
// that range, never silently clamped (FR-001).
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";
import type { LeadIndex, SearchPropertiesQuery } from "../src/adapters/duckDbParquet.js";

const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };

function property(overrides: Partial<Provenanced<CrmProperty>>): Provenanced<CrmProperty> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    requestIdentifier: "R-0001",
    latitude: 30.4118,
    longitude: -97.7069,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 32,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i",
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

class FakeLeadIndex implements LeadIndex {
  constructor(private readonly rows: Provenanced<CrmProperty>[]) {}
  async indexInfo() {
    return {
      manifestCid: "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i",
      propertyCount: this.rows.length,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  readonly queries: SearchPropertiesQuery[] = [];
  async searchProperties(query: SearchPropertiesQuery) {
    this.queries.push(query);
    // Mirrors the real adapter's center/radiusMi exact-circle cut closely enough for this
    // router-level contract test (the cut itself is proven directly in query.test.ts).
    let rows = this.rows;
    if (query.roofAgeMinYears !== undefined) {
      rows = rows.filter(
        (r) => r.roofAgeYears !== null && r.roofAgeYears >= (query.roofAgeMinYears as number),
      );
    }
    return rows;
  }
  async searchPermits(): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return undefined;
  }
  async getProperty() {
    return null;
  }
  async getPropertyByRequestIdentifier(requestIdentifier: string) {
    return this.rows.find((r) => r.requestIdentifier === requestIdentifier);
  }
}

const createCaller = createCallerFactory(appRouter);
const caller = createCaller({
  requestId: "test-request",
  leadIndex: new FakeLeadIndex([property({})]),
});

describe("search.properties", () => {
  it("accepts the full 0.5-25 mi bound inclusive", async () => {
    await expect(
      caller.search.properties({ center: PFLUGERVILLE, radiusMi: 0.5 }),
    ).resolves.toMatchObject({ manifestCid: expect.any(String) });
    await expect(
      caller.search.properties({ center: PFLUGERVILLE, radiusMi: 25 }),
    ).resolves.toMatchObject({ manifestCid: expect.any(String) });
  });

  it("rejects radiusMi below 0.5 with a Zod validation error, never silently clamped (FR-001)", async () => {
    await expect(caller.search.properties({ center: PFLUGERVILLE, radiusMi: 0.4 })).rejects.toThrow(
      TRPCError,
    );
  });

  it("rejects radiusMi above 25 with a Zod validation error, never silently clamped (FR-001)", async () => {
    await expect(
      caller.search.properties({ center: PFLUGERVILLE, radiusMi: 25.5 }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects an out-of-range latitude/longitude", async () => {
    await expect(
      caller.search.properties({ center: { lat: 400, lng: -97.62 }, radiusMi: 5 }),
    ).rejects.toThrow(TRPCError);
  });

  it("returns properties, counts, manifestCid and traceId", async () => {
    const result = await caller.search.properties({ center: PFLUGERVILLE, radiusMi: 10 });
    expect(result.properties).toHaveLength(1);
    expect(result.counts.afterRadius).toBe(1);
    expect(result.counts.afterRoofAge).toBe(1);
    expect(result.manifestCid).toBe("bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i");
    expect(typeof result.traceId).toBe("string");
  });

  it("roofAgeMinYears narrows counts.afterRoofAge without changing counts.afterRadius", async () => {
    const result = await caller.search.properties({
      center: PFLUGERVILLE,
      radiusMi: 10,
      roofAgeMinYears: 40,
    });
    expect(result.counts.afterRadius).toBe(1);
    expect(result.counts.afterRoofAge).toBe(0); // fixture roofAgeYears=32, below 40
    expect(result.properties).toHaveLength(0);
  });

  it("rejects limit above 100", async () => {
    await expect(
      caller.search.properties({ center: PFLUGERVILLE, radiusMi: 5, limit: 101 }),
    ).rejects.toThrow(TRPCError);
  });
});

// CR-B-09 finding 10: the agent's `counts.excludedNoRoofDate` comes from the search service, not a
// hard-coded 0. A row in the radius with no roof date can never satisfy a roof-age filter.
describe("search.properties counts.excludedNoRoofDate", () => {
  const withUndated = createCaller({
    requestId: "test-request-undated",
    leadIndex: new FakeLeadIndex([
      property({}),
      property({
        propertyCid: "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        requestIdentifier: "R-0002",
        roofAgeYears: null,
      }),
    ]),
  });

  it("counts in-radius rows with no roof date when a roof-age filter is applied", async () => {
    const result = await withUndated.search.properties({
      center: PFLUGERVILLE,
      radiusMi: 10,
      roofAgeMinYears: 15,
    });
    expect(result.counts).toMatchObject({ afterRadius: 2, afterRoofAge: 1, excludedNoRoofDate: 1 });
  });

  it("is 0 when no roof-age filter excluded anything", async () => {
    const result = await withUndated.search.properties({ center: PFLUGERVILLE, radiusMi: 10 });
    expect(result.counts.excludedNoRoofDate).toBe(0);
  });
});

// Owner filters: the router takes `tenureYearsMin` (0-100, integer) and `outOfArea`, and the
// service hands the adapter `tenureYearsMin` and `ownerAreaClass IN (regional, out_of_area)`.
describe("search.properties owner filters", () => {
  const fake = new FakeLeadIndex([property({})]);
  const ownerCaller = createCaller({ requestId: "owner", leadIndex: fake });

  it("passes tenureYearsMin and outOfArea to the adapter", async () => {
    await ownerCaller.search.properties({
      center: PFLUGERVILLE,
      radiusMi: 10,
      tenureYearsMin: 10,
      outOfArea: true,
    });
    const last = fake.queries[fake.queries.length - 1];
    expect(last).toMatchObject({
      tenureYearsMin: 10,
      ownerAreaClass: ["regional", "out_of_area"],
    });
  });

  it("outOfArea false or absent adds no owner filter", async () => {
    await ownerCaller.search.properties({ center: PFLUGERVILLE, radiusMi: 10, outOfArea: false });
    const last = fake.queries[fake.queries.length - 1];
    expect(last).not.toHaveProperty("ownerAreaClass");
    expect(last).not.toHaveProperty("tenureYearsMin");
  });

  it.each([-1, 101, 1.5])("rejects tenureYearsMin %s, never clamped", async (tenureYearsMin) => {
    await expect(
      ownerCaller.search.properties({ center: PFLUGERVILLE, radiusMi: 10, tenureYearsMin }),
    ).rejects.toThrow(TRPCError);
  });

  it("reports excludedNoTenure only when a tenure filter is applied", async () => {
    const plain = await ownerCaller.search.properties({ center: PFLUGERVILLE, radiusMi: 10 });
    expect(plain.counts.excludedNoTenure).toBe(0);
    const filtered = await ownerCaller.search.properties({
      center: PFLUGERVILLE,
      radiusMi: 10,
      tenureYearsMin: 5,
    });
    expect(filtered.counts.excludedNoTenure).toBe(1); // fixture tenureYears is absent
  });
});
