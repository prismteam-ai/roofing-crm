import { describe, expect, it } from "vitest";
import { CrmPermit, CrmProperty } from "../src/index.js";

const SAMPLE_MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const ROW_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsabcd";

function baseProperty(overrides: Record<string, unknown> = {}) {
  return {
    propertyCid: ROW_CID,
    requestIdentifier: "R123456",
    latitude: 30.27,
    longitude: -97.74,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 12,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    isLongTenure: true,
    tenureBasis: "sale_date",
    ownerName: null,
    ownerKind: "person",
    ownerAreaClass: "in_county",
    ownerIsOutOfArea: false,
    sourceManifestCid: SAMPLE_MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-09-21T10:35:16Z",
    cid: ROW_CID,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

describe("CrmProperty", () => {
  it("rejects a row with no sourceManifestCid (AC-1/FR-001: zero rows without provenance)", () => {
    const row = baseProperty();
    delete (row as Record<string, unknown>).sourceManifestCid;
    expect(CrmProperty.safeParse(row).success).toBe(false);
  });

  it("accepts a row with roofAgeYears null and its exact missing reason preserved (AC-3/FR-003)", () => {
    const row = baseProperty({
      roofAgeYears: null,
      roofAgeBasis: "unknown",
      roofAgeConfidence: "none",
      missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
    });
    const parsed = CrmProperty.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.roofAgeYears).toBeNull();
      expect(parsed.data.missingReasons).toEqual([
        { field: "roofAgeYears", reason: "no_roof_date" },
      ]);
    }
  });

  it("accepts an owner name or null, and still rejects any other extra key", () => {
    expect(CrmProperty.parse(baseProperty({ ownerName: "DOE, JANE" })).ownerName).toBe("DOE, JANE");
    expect(CrmProperty.parse(baseProperty({ ownerName: null })).ownerName).toBeNull();
    expect(CrmProperty.safeParse(baseProperty({ ownerPhone: "555" })).success).toBe(false);
  });
});

describe("additive source and sale fields", () => {
  it("accepts rows without them (index built earlier), with values, or with null", () => {
    const old = CrmProperty.parse(baseProperty());
    expect(old.structureBuiltYear).toBeUndefined();
    const full = CrmProperty.parse(
      baseProperty({
        structureBuiltYear: 1995,
        lastSaleDate: "2004-06-30",
        tenureYears: 22,
        sourceUrl: "https://example.test/x",
      }),
    );
    expect(full).toMatchObject({
      structureBuiltYear: 1995,
      lastSaleDate: "2004-06-30",
      tenureYears: 22,
    });
    expect(
      CrmProperty.parse(baseProperty({ structureBuiltYear: null, tenureYears: null })).tenureYears,
    ).toBeNull();
    expect(CrmProperty.safeParse(baseProperty({ structureBuiltYear: 1995.5 })).success).toBe(false);
  });
});

describe("CrmPermit", () => {
  it("rejects a row with no sourceManifestCid", () => {
    const row = {
      propertyCid: ROW_CID,
      permitCid: ROW_CID,
      jurisdiction: "Austin",
      permitNumber: "RF-2026-0001",
      improvementType: "roof",
      improvementAction: "replace",
      improvementStatus: null,
      statusClass: "stalled",
      issueDate: "2026-09-01T00:00:00Z",
      finalDate: null,
      permitCloseDate: null,
      finalInspectionDate: null,
      openDays: 51,
      contractorResolution: "unknown",
      contractorCompanyCid: null,
      contractorNameAsPrinted: null,
      bbbStatus: "not_checked",
      bbbStatusReason: "contractor_unresolved",
      bbbUrl: null,
      missingReasons: [{ field: "improvementStatus", reason: "enum_lacks_value" }],
      capturedAt: "2026-09-21T10:35:16Z",
      cid: ROW_CID,
      runId: "travis-202609-permits-20261021t103516z",
    };
    expect(CrmPermit.safeParse(row).success).toBe(false);
  });

  it("surfaces a null improvementStatus as statusClass 'stalled', never 'open' (P0-4)", () => {
    const row = {
      propertyCid: ROW_CID,
      permitCid: ROW_CID,
      jurisdiction: "Austin",
      permitNumber: "RF-2026-0001",
      improvementType: "roof",
      improvementAction: "replace",
      improvementStatus: null,
      statusClass: "stalled",
      issueDate: "2026-09-01T00:00:00Z",
      finalDate: null,
      permitCloseDate: null,
      finalInspectionDate: null,
      openDays: 51,
      contractorResolution: "unknown",
      contractorCompanyCid: null,
      contractorNameAsPrinted: null,
      bbbStatus: "not_checked",
      bbbStatusReason: "contractor_unresolved",
      bbbUrl: null,
      sourceManifestCid: SAMPLE_MANIFEST_CID,
      missingReasons: [{ field: "improvementStatus", reason: "enum_lacks_value" }],
      capturedAt: "2026-09-21T10:35:16Z",
      cid: ROW_CID,
      runId: "travis-202609-permits-20261021t103516z",
    };
    const parsed = CrmPermit.safeParse(row);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.statusClass).toBe("stalled");
    }
  });
});

describe("contract v1.1 (Run 3) values", () => {
  it("accepts an address_point coordinate source and a deed_date tenure basis (condo units, deed-dated tenure)", () => {
    const row = baseProperty({ coordinateSource: "address_point", tenureBasis: "deed_date" });
    expect(CrmProperty.parse(row)).toMatchObject({
      coordinateSource: "address_point",
      tenureBasis: "deed_date",
    });
  });

  it("rejects a coordinate source or BBB status outside the closed lists", () => {
    expect(CrmProperty.safeParse(baseProperty({ coordinateSource: "geocoded" })).success).toBe(
      false,
    );
    expect(
      CrmPermit.safeParse({
        propertyCid: ROW_CID,
        permitCid: ROW_CID,
        jurisdiction: "Austin",
        permitNumber: "RF-2026-0001",
        improvementType: "roof",
        improvementAction: "replace",
        improvementStatus: "open",
        statusClass: "open",
        issueDate: "2026-09-01T00:00:00Z",
        finalDate: null,
        permitCloseDate: null,
        finalInspectionDate: null,
        openDays: 51,
        contractorResolution: "unresolved",
        contractorCompanyCid: null,
        contractorNameAsPrinted: "ACME ROOFING LLC",
        bbbStatus: "excellent",
        bbbStatusReason: "bbb_blocked",
        bbbUrl: null,
        sourceManifestCid: SAMPLE_MANIFEST_CID,
        missingReasons: [],
        capturedAt: "2026-09-21T10:35:16Z",
        cid: ROW_CID,
        runId: "travis-202609-permits-20261021t103516z",
      }).success,
    ).toBe(false);
  });
});
