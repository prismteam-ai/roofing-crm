import { describe, expect, it } from "vitest";

import { buildQueryPermitsSqlForProperty } from "./build-query-permits-sql.js";

describe("buildQueryPermitsSqlForProperty", () => {
  it("builds a SELECT with property_id filter", () => {
    const sql = buildQueryPermitsSqlForProperty({
      propertyId: "prop-123",
      parcelIdentifier: null,
    });

    expect(sql).toContain("FROM permits");
    expect(sql).toContain("property_id = 'prop-123'");
    expect(sql).not.toContain("parcel_identifier");
  });

  it("includes parcel_identifier fallback when present", () => {
    const sql = buildQueryPermitsSqlForProperty({
      propertyId: "prop-123",
      parcelIdentifier: "folio-9",
    });

    expect(sql).toContain("property_id = 'prop-123'");
    expect(sql).toContain("parcel_identifier = 'folio-9'");
  });

  it("escapes single quotes in identifiers", () => {
    const sql = buildQueryPermitsSqlForProperty({
      propertyId: "prop'123",
      parcelIdentifier: "folio'9",
    });

    expect(sql).toContain("prop''123");
    expect(sql).toContain("folio''9");
  });
});
