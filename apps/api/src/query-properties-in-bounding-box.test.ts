import { describe, expect, it, vi } from "vitest";
import {
  buildNearestFirstBoundingBoxOrderBySql,
  createQueryPropertiesInBoundingBoxLoader,
  createQueryPropertyRowByIdLoader,
  escapeDuckDbStringLiteral,
  resolveSearchPropertyIdColumn,
  resolveSearchPropertySelectSql,
  SEARCH_PROPERTY_BBOX_QUERY_LIMIT,
} from "./query-properties-in-bounding-box.js";

const FORT_MYERS_CENTER = { lat: 26.6406, lng: -81.8723 };

describe("createQueryPropertiesInBoundingBoxLoader", () => {
  it("maps queryProperties rows into search property rows", async () => {
    const callTool = vi.fn(async () => [
      {
        property_id: "lee-live-1",
        parcel_identifier: "folio-1",
        latitude: 26.64,
        longitude: -81.87,
        built_year: 1980,
        address_street: "10 Palm",
        address_city: "Fort Myers",
      },
    ]);

    const listPropertiesInBoundingBox = createQueryPropertiesInBoundingBoxLoader({
      callTool,
    });

    const propertyRows = await listPropertiesInBoundingBox({
      county: "lee",
      boundingBox: {
        minLat: 26.6,
        minLng: -81.9,
        maxLat: 26.7,
        maxLng: -81.8,
      },
      center: FORT_MYERS_CENTER,
    });

    expect(callTool).toHaveBeenCalledWith(
      "queryProperties",
      expect.objectContaining({
        county: "lee",
        limit: SEARCH_PROPERTY_BBOX_QUERY_LIMIT,
      }),
    );
    expect(propertyRows).toEqual([
      {
        propertyId: "lee-live-1",
        parcelIdentifier: "folio-1",
        latitude: 26.64,
        longitude: -81.87,
        builtYear: 1980,
        builtYearSource: null,
        addressStreet: "10 Palm",
        addressCity: "Fort Myers",
        addressZip: null,
        hasPermits: null,
        permitCount: null,
        hasBbbContractor: null,
        gisMuni: null,
      },
    ]);
  });

  it("coerces Lee MCP string built_year into search rows", async () => {
    const callTool = vi.fn(async () => [
      {
        property_id: "lee-live-string-year",
        parcel_identifier: "folio-2",
        latitude: "26.641",
        longitude: "-81.871",
        built_year: "1985",
        address_street: "12 Palm",
        address_city: "Fort Myers",
      },
    ]);

    const listPropertiesInBoundingBox = createQueryPropertiesInBoundingBoxLoader({
      callTool,
    });

    const propertyRows = await listPropertiesInBoundingBox({
      county: "lee",
      boundingBox: {
        minLat: 26.6,
        minLng: -81.9,
        maxLat: 26.7,
        maxLng: -81.8,
      },
      center: FORT_MYERS_CENTER,
    });

    expect(propertyRows).toEqual([
      expect.objectContaining({
        propertyId: "lee-live-string-year",
        builtYear: 1985,
        latitude: 26.641,
        longitude: -81.871,
      }),
    ]);
  });

  it("asks DuckDB for an integer built_year so MCP JSON does not stringify BIGINT", async () => {
    const callTool = vi.fn(async () => []);

    const listPropertiesInBoundingBox = createQueryPropertiesInBoundingBoxLoader({
      callTool,
    });

    await listPropertiesInBoundingBox({
      county: "lee",
      boundingBox: {
        minLat: 26.6,
        minLng: -81.9,
        maxLat: 26.7,
        maxLng: -81.8,
      },
      center: FORT_MYERS_CENTER,
    });

    expect(callTool).toHaveBeenCalledWith(
      "queryProperties",
      expect.objectContaining({
        sql: expect.stringMatching(
          /TRY_CAST\(\s*built_year\s+AS INTEGER\s*\)\s+AS built_year/i,
        ),
      }),
    );
  });

  it("orders bbox rows nearest-first from the pin center", async () => {
    const callTool = vi.fn(async () => []);

    const listPropertiesInBoundingBox = createQueryPropertiesInBoundingBoxLoader({
      callTool,
    });

    await listPropertiesInBoundingBox({
      county: "lee",
      boundingBox: {
        minLat: 26.6,
        minLng: -81.9,
        maxLat: 26.7,
        maxLng: -81.8,
      },
      center: FORT_MYERS_CENTER,
    });

    const orderBySql = buildNearestFirstBoundingBoxOrderBySql(FORT_MYERS_CENTER);
    expect(callTool).toHaveBeenCalledWith(
      "queryProperties",
      expect.objectContaining({
        limit: SEARCH_PROPERTY_BBOX_QUERY_LIMIT,
        sql: expect.stringContaining(orderBySql),
      }),
    );
  });

  it("keeps valid parcels when a sibling row cannot be parsed", async () => {
    const callTool = vi.fn(async () => [
      {
        property_id: "lee-live-ok",
        parcel_identifier: "folio-ok",
        latitude: 26.64,
        longitude: -81.87,
        built_year: 1980,
        address_street: "10 Palm",
        address_city: "Fort Myers",
      },
      {
        parcel_identifier: "folio-missing-id",
        latitude: 26.641,
        longitude: -81.871,
        built_year: 1975,
        address_street: "11 Palm",
        address_city: "Fort Myers",
      },
    ]);

    const listPropertiesInBoundingBox = createQueryPropertiesInBoundingBoxLoader({
      callTool,
    });

    const propertyRows = await listPropertiesInBoundingBox({
      county: "lee",
      boundingBox: {
        minLat: 26.6,
        minLng: -81.9,
        maxLat: 26.7,
        maxLng: -81.8,
      },
      center: FORT_MYERS_CENTER,
    });

    expect(propertyRows).toEqual([
      expect.objectContaining({ propertyId: "lee-live-ok", builtYear: 1980 }),
    ]);
  });
});

describe("createQueryPropertyRowByIdLoader", () => {
  it("loads one property by id through queryProperties", async () => {
    const callTool = vi.fn(async () => [
      {
        property_id: "lee-live-1",
        parcel_identifier: "folio-1",
        latitude: 26.64,
        longitude: -81.87,
        built_year: 1980,
        address_street: "10 Palm",
        address_city: "Fort Myers",
      },
    ]);

    const loadById = createQueryPropertyRowByIdLoader({ callTool });
    const propertyRow = await loadById({
      county: "lee",
      propertyId: "lee-live-1",
    });

    expect(callTool).toHaveBeenCalledWith(
      "queryProperties",
      expect.objectContaining({
        county: "lee",
        limit: 1,
        sql: expect.stringContaining("lee-live-1"),
      }),
    );
    expect(propertyRow?.addressStreet).toBe("10 Palm");
  });

  it("escapes single quotes in property ids", () => {
    expect(escapeDuckDbStringLiteral("a'b")).toBe("a''b");
  });
});

describe("resolveSearchPropertySelectSql", () => {
  // Given the published Chester tables (request_identifier, property_cid,
  // latitude, longitude [+ demo roof-age/permit flags]) — no property_id,
  // no parcel_identifier, no addresses
  // When the dataset-aware SELECT is resolved
  // Then only published columns are referenced; identities come from aliases
  it("selects only published columns on the chester-demo table", () => {
    const sql = resolveSearchPropertySelectSql("chester-demo");

    expect(sql).toContain("request_identifier AS property_id");
    expect(sql).toContain("request_identifier AS parcel_identifier");
    expect(sql).toContain("built_year_source");
    expect(sql).toContain("has_roofing_permit AS has_permits");
    expect(sql).toContain("NULL AS address_street");
    expect(sql).not.toMatch(/SELECT property_id/);
    expect(sql).not.toMatch(/,\s*address_street\s*,/);
  });

  it("selects only published columns on the real chester table", () => {
    const sql = resolveSearchPropertySelectSql("chester");

    expect(sql).toContain("request_identifier AS property_id");
    expect(sql).toContain("NULL AS built_year");
    expect(sql).not.toMatch(/SELECT property_id/);
    expect(sql).not.toContain("has_roofing_permit");
  });

  it("keeps the standard 11-column view for other counties", () => {
    const sql = resolveSearchPropertySelectSql("lee");

    expect(sql).toContain("SELECT property_id, parcel_identifier");
    expect(sql).toContain("address_street");
    expect(sql).not.toContain("request_identifier");
  });

  it("filters Chester by the physical request_identifier column", () => {
    expect(resolveSearchPropertyIdColumn("chester-demo")).toBe("request_identifier");
    expect(resolveSearchPropertyIdColumn("chester")).toBe("request_identifier");
    expect(resolveSearchPropertyIdColumn("lee")).toBe("property_id");
  });
});
