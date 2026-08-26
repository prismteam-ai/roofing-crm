import { describe, expect, it } from "vitest";

import {
  buildRoofingOpportunityChunks,
  isOpenRoofingPermitDetail,
  resolveOpenPermitYears,
} from "./build-roofing-opportunity-chunks.js";
import { mapOraclePropertyPermitRecordToPropertyPermitDetail } from "../routers/properties.js";

describe("buildRoofingOpportunityChunks", () => {
  it("emits property summary and roofing permit chunks with deterministic ids", () => {
    const chunks = buildRoofingOpportunityChunks({
      county: "lee",
      propertyRow: {
        propertyId: "lee-prop-202",
        parcelIdentifier: "p-202",
        latitude: 26.6388,
        longitude: -81.8745,
        builtYear: 2005,
        addressStreet: "880 Cypress Lane",
        addressCity: "Fort Myers",
        addressZip: null,
        hasPermits: true,
        permitCount: 1,
        hasBbbContractor: false,
        gisMuni: null,
      },
      oraclePropertyRecord: {
        propertyId: "lee-prop-202",
        builtYear: 2005,
        permits: [
          {
            permitNumber: "PR-202",
            permitType: "Roofing",
            status: "Open",
            openedDate: "2019-06-01",
            contractor: "Acme Roofers",
          },
        ],
      },
      indexedAt: "2026-08-24T00:00:00.000Z",
      provenance: "test",
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.documentKind).toBe("property_summary");
    expect(chunks[0]?.parcel_identifier).toBe("p-202");
    expect(chunks[1]?.documentKind).toBe("roofing_permit");
    expect(chunks[1]?.chunkId).toBe("lee-prop-202#permit-PR-202");
    expect(chunks[1]?.has_open_roofing_permit).toBe(true);
    expect(chunks[1]?.contractor_name).toBe("Acme Roofers");
  });

  it("treats closed roofing permits as detail-only, not open chunks", () => {
    const permitDetail = mapOraclePropertyPermitRecordToPropertyPermitDetail({
      permitType: "Roofing",
      status: "Closed",
      openedDate: "2010-01-01",
    });
    expect(isOpenRoofingPermitDetail(permitDetail)).toBe(false);
  });

  it("computes open permit years from opened date", () => {
    const permitDetail = mapOraclePropertyPermitRecordToPropertyPermitDetail({
      permitType: "Roofing",
      status: "Open",
      openedDate: "2019-01-01",
    });
    const years = resolveOpenPermitYears(
      permitDetail,
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(years).toBeGreaterThanOrEqual(6);
  });
});
