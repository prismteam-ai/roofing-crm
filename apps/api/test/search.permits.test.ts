// T026 (B-03, US3): search.permits per contracts/search-api.md — sort fixed to "openDays"
// descending, nulls last, joined through the same radius-filtered property set search.properties
// computes (SC-06), with isLongOpen (packages/domain) attached per row, never recomputed from
// issueDate. Exercises the router directly (createCallerFactory), injecting a fake LeadIndex into
// the tRPC context (the same convention as search.properties.test.ts) so this never reaches real
// DynamoDB/S3.
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../src/adapters/duckDbParquet.js";

const PFLUGERVILLE = { lat: 30.4394, lng: -97.62 };
const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";

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
    sourceManifestCid: MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

function permit(overrides: Partial<Provenanced<CrmPermit>>): Provenanced<CrmPermit> {
  return {
    propertyCid: "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    permitCid: "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    jurisdiction: "travis",
    permitNumber: "P-0001",
    improvementType: "roof",
    improvementAction: "replace",
    improvementStatus: "open",
    statusClass: "open",
    issueDate: "2026-09-01",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 28,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: null,
    bbbStatusReason: null,
    bbbUrl: null,
    sourceManifestCid: MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

class FakeLeadIndex implements LeadIndex {
  constructor(
    private readonly properties: Provenanced<CrmProperty>[],
    private readonly permits: Provenanced<CrmPermit>[],
  ) {}
  async indexInfo() {
    return {
      manifestCid: MANIFEST_CID,
      propertyCount: this.properties.length,
      permitCount: this.permits.length,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(_query: SearchPropertiesQuery) {
    return this.properties;
  }
  async searchPermits(query: SearchPermitsQuery) {
    let rows = this.permits;
    if (query.propertyCids !== undefined) {
      rows = rows.filter((p) => query.propertyCids?.includes(p.propertyCid));
    }
    // Longest-open first, nulls last — the same contract the real adapter's SQL enforces.
    return [...rows].sort((a, b) => {
      if (a.openDays === null) return 1;
      if (b.openDays === null) return -1;
      return b.openDays - a.openDays;
    });
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
    return this.properties.find((p) => p.requestIdentifier === requestIdentifier);
  }
}

function makeCaller(properties: Provenanced<CrmProperty>[], permits: Provenanced<CrmPermit>[]) {
  const createCaller = createCallerFactory(appRouter);
  return createCaller({
    requestId: "test-request",
    leadIndex: new FakeLeadIndex(properties, permits),
  });
}

describe("search.permits", () => {
  it("rejects a radiusMi outside 0.5-25 (FR-001, same bound as search.properties)", async () => {
    const caller = makeCaller([property({})], [permit({})]);
    await expect(
      caller.search.permits({ center: PFLUGERVILLE, radiusMi: 0.4, sort: "openDays" }),
    ).rejects.toThrow(TRPCError);
  });

  it("rejects a sort value other than 'openDays' (contracts/search-api.md: fixed sort)", async () => {
    const caller = makeCaller([property({})], [permit({})]);
    await expect(
      caller.search.permits({
        center: PFLUGERVILLE,
        radiusMi: 5,
        sort: "issueDate" as "openDays",
      }),
    ).rejects.toThrow(TRPCError);
  });

  it("B-03-TC-016: sorts permits longest-open first, nulls last", async () => {
    const p1 = property({ propertyCid: "P1" });
    const permits = [
      permit({ propertyCid: "P1", permitCid: "PM-28", openDays: 28 }),
      permit({ propertyCid: "P1", permitCid: "PM-47", openDays: 47 }),
      permit({ propertyCid: "P1", permitCid: "PM-null", openDays: null, statusClass: "closed" }),
    ];
    const caller = makeCaller([p1], permits);
    const result = await caller.search.permits({
      center: PFLUGERVILLE,
      radiusMi: 5,
      sort: "openDays",
    });
    expect(result.permits.map((p) => p.permitCid)).toEqual(["PM-47", "PM-28", "PM-null"]);
  });

  it("B-03-TC-017 (shape only; the real threshold is proven in packages/domain): attaches isLongOpen per row, never stored", async () => {
    const p1 = property({ propertyCid: "P1" });
    const permits = [
      permit({ propertyCid: "P1", permitCid: "PM-47", openDays: 47 }),
      permit({ propertyCid: "P1", permitCid: "PM-1900", openDays: 1900 }),
    ];
    const caller = makeCaller([p1], permits);
    const result = await caller.search.permits({
      center: PFLUGERVILLE,
      radiusMi: 5,
      sort: "openDays",
    });
    const byId = new Map(result.permits.map((p) => [p.permitCid, p.isLongOpen]));
    expect(byId.get("PM-47")).toBe(false);
    expect(byId.get("PM-1900")).toBe(true);
  });

  it("joins through the same radius-filtered property set as search.properties (SC-06)", async () => {
    const p1 = property({ propertyCid: "P1" });
    // P2 never comes back from searchProperties in this fixture (outside radius), so its permit
    // must never appear even though it's in the raw permits array.
    const permits = [
      permit({ propertyCid: "P1", permitCid: "PM-in" }),
      permit({ propertyCid: "P2", permitCid: "PM-out" }),
    ];
    const caller = makeCaller([p1], permits);
    const result = await caller.search.permits({
      center: PFLUGERVILLE,
      radiusMi: 5,
      sort: "openDays",
    });
    expect(result.permits.map((p) => p.permitCid)).toEqual(["PM-in"]);
  });

  it("returns manifestCid and traceId", async () => {
    const caller = makeCaller([property({})], [permit({})]);
    const result = await caller.search.permits({
      center: PFLUGERVILLE,
      radiusMi: 5,
      sort: "openDays",
    });
    expect(result.manifestCid).toBe(MANIFEST_CID);
    expect(typeof result.traceId).toBe("string");
  });
});
