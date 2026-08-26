import { describe, expect, it } from "vitest";
import {
  parsePublishedPropertyRow,
  publishedPropertyRowSchema,
} from "./published-property-row.js";

/**
 * Full Lee published-properties view (37 columns).
 * `gis_muni` is intentionally omitted — it is not on the Lee view.
 */
const leePublishedPropertyRowFixture = {
  property_id: "lee-prop-001",
  property_cid: "bafybeigfixturecid001",
  request_identifier: "req-001",
  parcel_identifier: "12-34-56-78-90",
  source_system: "lee-county-assessor",
  county_name: "Lee",
  state_code: "FL",
  address_street: "123 Palm Ave",
  address_city: "Fort Myers",
  address_zip: "33901",
  latitude: 26.6406,
  longitude: -81.8723,
  lot_size_acre: 0.25,
  lot_area_sqft: 10890,
  exterior_wall_material: "stucco",
  roof_covering_material: "asphalt shingle",
  property_type: "residential",
  property_usage_type: "single_family",
  built_year: 1980,
  livable_floor_area: 1800,
  total_area: 2200,
  assessed_value: 250000,
  market_value: 310000,
  land_value: 80000,
  avm_value: 305000,
  owner_name: "Jane Example",
  owners_text: "Jane Example",
  owner_count: 1,
  owner_occupied: true,
  last_sale_date: "2019-06-15",
  last_sale_price: 275000,
  subdivision: "Palm Grove",
  has_permits: false,
  permit_count: 0,
  has_sunbiz_tenant: false,
  has_bbb_contractor: false,
  hoa_flag: null,
} as const;

describe("PublishedPropertyRow", () => {
  it("parses 37-column Lee fixture with built_year", () => {
    // Given a complete Lee published-properties row with structure year 1980
    // When parsePublishedPropertyRow runs
    // Then all 37 view columns are accepted and built_year is 1980
    const publishedPropertyRow = parsePublishedPropertyRow(
      leePublishedPropertyRowFixture,
    );

    expect(publishedPropertyRow.property_id).toBe("lee-prop-001");
    expect(publishedPropertyRow.built_year).toBe(1980);
    expect(publishedPropertyRow.latitude).toBe(26.6406);
    expect(publishedPropertyRow.longitude).toBe(-81.8723);
    expect("gis_muni" in publishedPropertyRow).toBe(false);
    expect(Object.keys(publishedPropertyRowSchema.shape)).toHaveLength(38);
  });

  it("allows null built_year", () => {
    const publishedPropertyRow = parsePublishedPropertyRow({
      ...leePublishedPropertyRowFixture,
      built_year: null,
    });

    expect(publishedPropertyRow.built_year).toBeNull();
    expect(publishedPropertyRow.property_id).toBe("lee-prop-001");
  });

  it("coerces string built_year and lat/lng from Montgomery-style rows", () => {
    const publishedPropertyRow = parsePublishedPropertyRow({
      ...leePublishedPropertyRowFixture,
      built_year: "1985",
      latitude: "40.1234",
      longitude: "-75.5678",
    });

    expect(publishedPropertyRow.built_year).toBe(1985);
    expect(publishedPropertyRow.latitude).toBeCloseTo(40.1234);
    expect(publishedPropertyRow.longitude).toBeCloseTo(-75.5678);
  });

  it("treats non-numeric built_year strings as null instead of failing parse", () => {
    const publishedPropertyRow = parsePublishedPropertyRow({
      ...leePublishedPropertyRowFixture,
      built_year: "unknown",
    });

    expect(publishedPropertyRow.built_year).toBeNull();
    expect(publishedPropertyRow.property_id).toBe("lee-prop-001");
  });

  it("rejects missing property_id", () => {
    // Given a row that omits the lead/property key
    // When parsePublishedPropertyRow runs
    // Then validation fails — property_id is required for properties.get and leads
    const { property_id: _omitted, ...withoutPropertyId } =
      leePublishedPropertyRowFixture;

    expect(() => parsePublishedPropertyRow(withoutPropertyId)).toThrow();
  });
});
