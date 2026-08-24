import { describe, expect, it } from "vitest";

import { mapElephantOraclePropertyPayload } from "./map-elephant-oracle-property-payload.js";

const chesterQueryTablePropertyId = "5d68bb33-2097-41c6-8fad-c43b3a904153";

const chesterNestedOraclePropertyFixture = {
  parcelId: "2e6c4dfc-5e56-4a4c-83c3-c8b1878f67cf",
  parcel: {
    parcelIdentifier: "1101",
  },
  address: {
    street: "219 LACEY ST",
    city: "WEST CHESTER, PA",
    postalCode: "19380",
    latitude: "39.96012",
    longitude: "-75.60501",
  },
  property: {
    builtYear: null,
  },
  permits: [],
  bbbProfiles: [],
};

describe("mapElephantOraclePropertyPayload", () => {
  // Given nested Chester consolidated JSON from live MCP
  // When the mapper runs with the query-table property id
  // Then the CRM record echoes the request id and nested address fields
  it("maps nested Chester consolidated JSON and echoes request propertyId", () => {
    const mapped = mapElephantOraclePropertyPayload(
      chesterNestedOraclePropertyFixture,
      chesterQueryTablePropertyId,
    );

    expect(mapped.propertyId).toBe(chesterQueryTablePropertyId);
    expect(mapped.parcelIdentifier).toBe("1101");
    expect(mapped.addressStreet).toBe("219 LACEY ST");
    expect(mapped.addressCity).toBe("WEST CHESTER, PA");
    expect(mapped.addressZip).toBe("19380");
    expect(mapped.latitude).toBeCloseTo(39.96012);
    expect(mapped.longitude).toBeCloseTo(-75.60501);
    expect(mapped.builtYear).toBeNull();
    expect(mapped.permits).toEqual([]);
    expect(mapped.businessReputationProfiles).toEqual([]);
  });

  // Given a flat mock payload used in local tests
  // When the mapper runs
  // Then the flat shape still parses
  it("maps flat legacy payloads with top-level propertyId", () => {
    const mapped = mapElephantOraclePropertyPayload(
      {
        propertyId: "lee-prop-100",
        parcelIdentifier: "folio-100",
        addressStreet: "100 Palm Ave",
        addressCity: "Fort Myers",
        builtYear: 1985,
        latitude: 26.6406,
        longitude: -81.8723,
        permits: [],
        businessReputationProfiles: [],
      },
      "lee-prop-100",
    );

    expect(mapped.propertyId).toBe("lee-prop-100");
    expect(mapped.builtYear).toBe(1985);
  });
});
