// T014 (Phase 3, INDEX): BuildIndex's contract (contracts/sync-pipeline.md) — given a fixture of
// already-verified parts (no network), it writes crm_property/crm_permit rows each carrying
// sourceManifestCid, and makes zero network calls. Written first, shown failing (no handler
// exists yet). The fixture here is a fake QueryEngine standing in for "a DuckDB already bound to
// this run's verified parts" — BuildIndex's own contract is that it never fetches those parts
// itself (that boundary belongs entirely to FetchPart/machamp), so a fixture engine is the
// correct double for this unit: it proves the mapping/validation core, not the S3/DuckDB plumbing
// around it (exercised instead on the hosted runtime, Phase Z).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIndexCore } from "../handlers/buildIndex.js";
import type { ViewRow } from "../handlers/buildIndex.js";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const PROPERTY_CID = "baguqeeraqc3y3bh65rbd42zgdrkctaulckvvidmgb52pghyansb43vumoh6q";
const PERMIT_CID = "baguqeeraqxod4kdmjfpzqdu36b5jyvb5fe4mdlmvxolgukqvugex7hkwgdtq";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";

function propertyRow(overrides: Partial<ViewRow> = {}): ViewRow {
  return {
    property_cid: PROPERTY_CID,
    request_identifier: "0208011301",
    latitude: 30.26,
    longitude: -97.74,
    coordinate_source: "gis_centroid",
    property_type: "SingleFamily",
    property_usage_type: "Residential",
    roof_age_years: 18,
    roof_age_basis: "built_year",
    roof_age_confidence: "low",
    is_long_tenure: null,
    tenure_basis: "sale_date",
    owner_name: null,
    owner_kind: null,
    owner_area_class: "unknown",
    owner_is_out_of_area: null,
    missing: [{ field: "last_ownership_transfer_date", reason: "no_dated_sale" }],
    captured_at: "2026-10-21T10:35:59.798Z",
    cid: RUN_CID,
    run_id: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

function permitRow(overrides: Partial<ViewRow> = {}): ViewRow {
  return {
    permit_cid: PERMIT_CID,
    property_cid: PROPERTY_CID,
    jurisdiction: "austin",
    permit_number: "2026-123456 RP",
    improvement_type: "Roofing",
    improvement_action: "Replacement",
    improvement_status: "Completed",
    status_class: "closed",
    issue_date: "2026-09-02",
    final_date: "2026-09-10",
    permit_close_date: "2026-09-10",
    final_inspection_date: "2026-09-10",
    open_days: 8,
    contractor_resolution: "resolved",
    contractor_company_cid: null,
    contractor_name_as_printed: null,
    bbb_status: "not_checked",
    bbb_status_reason: "contractor_unresolved",
    bbb_url: null,
    missing: [],
    captured_at: "2026-10-21T10:35:59.798Z",
    cid: RUN_CID,
    run_id: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

function fakeEngine(properties: ViewRow[], permits: ViewRow[]) {
  return {
    run: async () => undefined,
    all: async (sql: string) => {
      if (sql.includes("v_property")) return properties;
      if (sql.includes("v_roofing_permit")) return permits;
      throw new Error(`fakeEngine: unexpected query: ${sql}`);
    },
  };
}

describe("BuildIndex", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Assert via a mock that throws on any fetch call — BuildIndex must never make one
    // (contracts/sync-pipeline.md: "Must not make any network call to Task A or any gateway").
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("BuildIndex must never call fetch()");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("writes crm_property/crm_permit rows each carrying sourceManifestCid, with zero network calls", async () => {
    const engine = fakeEngine([propertyRow()], [permitRow()]);

    const result = await buildIndexCore(engine, MANIFEST_CID);

    expect(result.properties).toHaveLength(1);
    expect(result.permits).toHaveLength(1);
    expect(result.properties[0]?.sourceManifestCid).toBe(MANIFEST_CID);
    expect(result.permits[0]?.sourceManifestCid).toBe(MANIFEST_CID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("carries the owner name verbatim, or null with its reason, never an invented name (ADR-03 as amended)", async () => {
    const named = propertyRow({ owner_name: "DOE, JANE", owner_kind: "person" });
    const unnamed = propertyRow({
      owner_name: null,
      missing: [{ field: "owner_name", reason: "owner_confidential" }],
    });
    const result = await buildIndexCore(fakeEngine([named, unnamed], []), MANIFEST_CID);
    expect(result.properties[0]?.ownerName).toBe("DOE, JANE");
    expect(result.properties[1]?.ownerName).toBeNull();
    expect(result.properties[1]?.missingReasons).toEqual([
      { field: "owner_name", reason: "owner_confidential" },
    ]);
  });

  it("carries built year, last sale date (date only), tenure years and source URLs; null keeps its reason", async () => {
    const dated = propertyRow({
      property_structure_built_year: 1995,
      last_ownership_transfer_date: new Date("2004-06-30T00:00:00.000Z"),
      tenure_years: 22,
      source_url: "https://example.test/tcad/file.csv",
    });
    const undated = propertyRow({
      property_structure_built_year: null,
      last_ownership_transfer_date: null,
      tenure_years: null,
      source_url: null,
      missing: [
        { field: "property_structure_built_year", reason: "source_missing" },
        { field: "last_ownership_transfer_date", reason: "no_dated_sale" },
        { field: "tenure_years", reason: "no_dated_sale" },
      ],
    });
    const permit = permitRow({
      source_url: "https://data.austintexas.gov/resource/3syk-w9eu.json?permit_number=P-1",
    });
    const result = await buildIndexCore(fakeEngine([dated, undated], [permit]), MANIFEST_CID);
    expect(result.properties[0]).toMatchObject({
      structureBuiltYear: 1995,
      lastSaleDate: "2004-06-30",
      tenureYears: 22,
      sourceUrl: "https://example.test/tcad/file.csv",
    });
    expect(result.properties[1]).toMatchObject({
      structureBuiltYear: null,
      lastSaleDate: null,
      tenureYears: null,
      sourceUrl: null,
    });
    expect(result.properties[1]?.missingReasons).toContainEqual({
      field: "last_ownership_transfer_date",
      reason: "no_dated_sale",
    });
    expect(result.permits[0]?.sourceUrl).toContain("3syk-w9eu");
  });

  // Found live (ZodError on the first real run, against the deployed state machine): DuckDB
  // returns TIMESTAMP/DATE columns as native JS Date objects, not strings, so a row straight off
  // the real v_property/v_roofing_permit views fails CrmProperty's/CrmPermit's `string` fields
  // unless BuildIndex converts them first.
  it("converts DuckDB's native Date objects to ISO strings for every date-ish field", async () => {
    const capturedAt = new Date("2026-10-21T10:35:59.798Z");
    const issueDate = new Date("2026-09-02T00:00:00.000Z");
    const engine = fakeEngine(
      [propertyRow({ captured_at: capturedAt })],
      [permitRow({ captured_at: capturedAt, issue_date: issueDate, final_date: null })],
    );

    const result = await buildIndexCore(engine, MANIFEST_CID);

    expect(result.properties[0]?.capturedAt).toBe("2026-10-21T10:35:59.798Z");
    expect(result.permits[0]?.capturedAt).toBe("2026-10-21T10:35:59.798Z");
    expect(result.permits[0]?.issueDate).toBe("2026-09-02T00:00:00.000Z");
    expect(result.permits[0]?.finalDate).toBeNull();
  });

  // contract v1.1 (Run 3): these values used to fail CrmProperty/CrmPermit validation (the
  // coordinate-source enum had no address_point), which would have aborted the whole index build.
  it("carries Run 3's v1.1 values: address-point coordinates, deed-dated tenure, printed contractor, BBB state", async () => {
    const engine = fakeEngine(
      [
        propertyRow({
          coordinate_source: "address_point",
          is_long_tenure: true,
          tenure_basis: "deed_date",
        }),
      ],
      [
        permitRow({
          contractor_resolution: "unresolved",
          contractor_name_as_printed: "ACME ROOFING LLC",
          bbb_status: "blocked",
          bbb_status_reason: "bbb_blocked",
          bbb_url:
            "https://www.bbb.org/search?find_text=ACME%20ROOFING%20LLC&find_loc=Austin%2C%20TX",
          missing: [{ field: "bbb_rating", reason: "bbb_blocked" }],
        }),
      ],
    );

    const result = await buildIndexCore(engine, MANIFEST_CID);

    expect(result.properties[0]).toMatchObject({
      coordinateSource: "address_point",
      isLongTenure: true,
      tenureBasis: "deed_date",
    });
    expect(result.permits[0]).toMatchObject({
      contractorResolution: "unresolved",
      contractorNameAsPrinted: "ACME ROOFING LLC",
      bbbStatus: "blocked",
      bbbStatusReason: "bbb_blocked",
      bbbUrl: expect.stringMatching(/^https:\/\/www\.bbb\.org\//),
    });
    expect(result.permits[0]?.missingReasons).toEqual([
      { field: "bbb_rating", reason: "bbb_blocked" },
    ]);
  });

  it("keeps a missing printed contractor name null with its reason, never a placeholder name", async () => {
    const engine = fakeEngine(
      [propertyRow()],
      [
        permitRow({
          contractor_name_as_printed: null,
          bbb_status: "not_checked",
          bbb_status_reason: "contractor_unresolved",
          missing: [{ field: "contractor_name_as_printed", reason: "contractor_unresolved" }],
        }),
      ],
    );

    const result = await buildIndexCore(engine, MANIFEST_CID);

    expect(result.permits[0]?.contractorNameAsPrinted).toBeNull();
    expect(result.permits[0]?.missingReasons).toEqual([
      { field: "contractor_name_as_printed", reason: "contractor_unresolved" },
    ]);
  });
});
