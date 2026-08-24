import { describe, expect, it } from "vitest";

import { mapSearchPropertyRowToOraclePropertyRecord } from "./map-search-property-row-to-oracle-property-record.js";
import type { SearchInRadiusPropertyRow } from "./routers/search.js";

describe("mapSearchPropertyRowToOraclePropertyRecord", () => {
  it("passes through permit and BBB flags without inventing detail rows", () => {
    const propertyRow: SearchInRadiusPropertyRow = {
      propertyId: "lee-prop-1",
      parcelIdentifier: "folio-1",
      latitude: 26.64,
      longitude: -81.87,
      builtYear: 1990,
      addressStreet: "1 Palm Ave",
      addressCity: "Fort Myers",
      addressZip: "33901",
      hasPermits: true,
      permitCount: 2,
      hasBbbContractor: true,
      gisMuni: null,
    };

    const oracleRecord = mapSearchPropertyRowToOraclePropertyRecord(propertyRow);

    expect(oracleRecord.hasPermits).toBe(true);
    expect(oracleRecord.permitCount).toBe(2);
    expect(oracleRecord.hasBbbContractor).toBe(true);
    expect(oracleRecord.addressZip).toBe("33901");
    expect(oracleRecord.permits).toBeUndefined();
    expect(oracleRecord.businessReputationProfiles).toBeUndefined();
  });
});
