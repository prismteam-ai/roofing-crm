// T031 (B-03, US4): property.get per contracts/property-detail.md — returns `property: null`
// (never throws) when the CID isn't in the promoted run; reads bbb_status/bbb_status_reason
// (v1's pinned "not_checked", derived from contractorResolution per packages/oracle-contract's
// own column derivation rule, never a new guess); bbbStatus !== "rated" always returns a
// non-empty bbbStatusReason. Exercises the router directly (createCallerFactory), injecting a
// fake LeadIndex into the tRPC context, same convention as search.properties.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { gazetteer } from "@crm/oracle-views";
import { appRouter } from "../src/routers/index.js";
import { createCallerFactory } from "../src/trpc.js";
import type { LeadIndex } from "../src/adapters/duckDbParquet.js";

const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const PROPERTY_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function property(overrides: Partial<Provenanced<CrmProperty>> = {}): Provenanced<CrmProperty> {
  return {
    propertyCid: PROPERTY_CID,
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
    cid: PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

function permit(overrides: Partial<Provenanced<CrmPermit>> = {}): Provenanced<CrmPermit> {
  return {
    propertyCid: PROPERTY_CID,
    permitCid: "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    jurisdiction: "travis",
    permitNumber: "P-0028",
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
    private readonly byCid: Map<
      string,
      Provenanced<CrmProperty> & { permits: Provenanced<CrmPermit>[] }
    >,
  ) {}
  async indexInfo() {
    return {
      manifestCid: MANIFEST_CID,
      propertyCount: this.byCid.size,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties() {
    return [];
  }
  async searchPermits() {
    return [];
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return undefined;
  }
  async getProperty(propertyCid: string) {
    return this.byCid.get(propertyCid) ?? null;
  }
  async getPropertyByRequestIdentifier(requestIdentifier: string) {
    return [...this.byCid.values()].find((p) => p.requestIdentifier === requestIdentifier);
  }
}

function makeCaller(entries: (Provenanced<CrmProperty> & { permits: Provenanced<CrmPermit>[] })[]) {
  const byCid = new Map(entries.map((e) => [e.propertyCid, e]));
  const createCaller = createCallerFactory(appRouter);
  return createCaller({ requestId: "test-request", leadIndex: new FakeLeadIndex(byCid) });
}

const SAVED_EXPLORER = process.env.EXPLORER_BASE_URL;
beforeEach(() => {
  process.env.EXPLORER_BASE_URL = "https://countylens.example.test";
});
afterEach(() => {
  if (SAVED_EXPLORER === undefined) delete process.env.EXPLORER_BASE_URL;
  else process.env.EXPLORER_BASE_URL = SAVED_EXPLORER;
});

describe("property.get", () => {
  it("returns property: null (never throws) when the CID isn't in the promoted run", async () => {
    const caller = makeCaller([]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.property).toBeNull();
    expect(result.permits).toEqual([]);
    expect(result.manifestCid).toBe(MANIFEST_CID);
  });

  it("B-03-TC-019/TC-021: an unresolved contractor -> not_checked + contractor_unresolved reason", async () => {
    const caller = makeCaller([
      { ...property(), permits: [permit({ contractorResolution: "unresolved" })] },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.property).not.toBeNull();
    expect(result.bbbStatus).toBe("not_checked");
    expect(result.bbbStatusReason).toBe("contractor_unresolved");
  });

  it("a resolved contractor still gets not_checked (v1 never checks BBB live) with no_lexicon_carrier", async () => {
    const caller = makeCaller([
      { ...property(), permits: [permit({ contractorResolution: "resolved" })] },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.bbbStatus).toBe("not_checked");
    expect(result.bbbStatusReason).toBe("no_lexicon_carrier");
  });

  it("Run 3 (contract v1.1): a permit's own bbb_status and reason pass through verbatim", async () => {
    const caller = makeCaller([
      {
        ...property(),
        permits: [
          permit({
            contractorResolution: "unresolved",
            contractorNameAsPrinted: "ACME ROOFING LLC",
            bbbStatus: "blocked",
            bbbStatusReason: "bbb_blocked",
            bbbUrl: "https://www.bbb.org/search?find_text=ACME%20ROOFING%20LLC",
          }),
        ],
      },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.bbbStatus).toBe("blocked");
    expect(result.bbbStatusReason).toBe("bbb_blocked");
    expect(result.permits[0]?.contractorNameAsPrinted).toBe("ACME ROOFING LLC");
  });

  it("bbbStatus is never 'rated' and bbbStatusReason is never empty for a found property (AC-7)", async () => {
    const caller = makeCaller([{ ...property(), permits: [permit({})] }]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.bbbStatus).not.toBe("rated");
    expect(result.bbbStatusReason).not.toBe("");
    expect(result.bbbStatusReason).not.toBeNull();
  });

  it("returns a lineageUrl that opens Task A's Explorer at the property: /tx/travis/explore with at, r and sel (B-03-TC-020)", async () => {
    const caller = makeCaller([
      { ...property({ latitude: 30.3597374, longitude: -97.751527 }), permits: [] },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    const url = new URL(result.lineageUrl ?? "");
    expect(url.protocol).toBe("https:");
    // The old `/explore` path answers 404 on Task A's site since A-13.
    expect(url.pathname).toBe("/tx/travis/explore");
    expect(url.searchParams.get("sel")).toBe(PROPERTY_CID);
    expect(url.searchParams.get("at")).toBe("30.3597374,-97.751527");
    expect(url.searchParams.get("r")).toBe("1");
  });

  it("lineageUrl is null when EXPLORER_BASE_URL is not configured (no default host)", async () => {
    delete process.env.EXPLORER_BASE_URL;
    const caller = makeCaller([{ ...property(), permits: [] }]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.lineageUrl).toBeNull();
  });

  it("a property with no coordinates still links to the Explorer by sel only", async () => {
    const caller = makeCaller([{ ...property({ latitude: null, longitude: null }), permits: [] }]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    const url = new URL(result.lineageUrl ?? "");
    expect(url.pathname).toBe("/tx/travis/explore");
    expect(url.searchParams.get("sel")).toBe(PROPERTY_CID);
    expect(url.searchParams.has("at")).toBe(false);
  });

  it("returns permits joined by propertyCid, read verbatim (never recomputed)", async () => {
    const p = permit({ openDays: 28, statusClass: "open" });
    const caller = makeCaller([{ ...property(), permits: [p] }]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.openDays).toBe(28);
    expect(result.permits[0]?.statusClass).toBe("open");
  });

  it("returns nearPlace: the nearest travis-places@1.0.0 centroid, with its digest", async () => {
    const caller = makeCaller([
      { ...property({ latitude: 30.447765, longitude: -97.602116 }), permits: [] },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.nearPlace).toEqual({
      name: "Pflugerville",
      distanceMi: 0,
      source: "travis-places@1.0.0",
      sha256: gazetteer.GAZETTEER.sha256,
    });
  });

  it("omits nearPlace when the property has no coordinates (never a guessed place)", async () => {
    const caller = makeCaller([
      {
        ...property({
          latitude: null,
          longitude: null,
          missingReasons: [{ field: "latitude", reason: "no_coordinates" }],
        }),
        permits: [],
      },
    ]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect(result.property).not.toBeNull();
    expect(result.nearPlace).toBeUndefined();
    expect("nearPlace" in result).toBe(false);
  });

  it("omits nearPlace when the property is not in this run", async () => {
    const caller = makeCaller([]);
    const result = await caller.property.get({ propertyCid: PROPERTY_CID });
    expect("nearPlace" in result).toBe(false);
  });

  it("rejects a propertyCid that isn't a CIDv1 string", async () => {
    const caller = makeCaller([]);
    await expect(caller.property.get({ propertyCid: "not-a-cid" })).rejects.toThrow();
  });
});
