import { describe, expect, it } from "vitest";

import { resolveLeadPermitSignalsFromPermitRecords } from "./resolve-lead-permit-signals.js";
import type { OraclePropertyPermitRecord } from "./routers/properties.js";

function buildPermitRecord(
  overrides: Partial<OraclePropertyPermitRecord> = {},
): OraclePropertyPermitRecord {
  return {
    permitNumber: "BP-1",
    permitType: "Roofing",
    status: "open",
    issuedDate: "2019-05-01",
    openedDate: null,
    closedDate: null,
    description: "Re-roof",
    contractor: null,
    sourceSystem: null,
    provenanceClass: "smartgov_ucc",
    ...overrides,
  };
}

describe("resolveLeadPermitSignalsFromPermitRecords", () => {
  // Given two selected open permits issued 2019 and 2023
  // When signals are resolved for 2026
  // Then maxOpenPermitYears is 7 and both provenance classes are collected
  it("computes max open years and collects provenance from selected permits", () => {
    const signals = resolveLeadPermitSignalsFromPermitRecords({
      permitRecords: [
        buildPermitRecord({ permitNumber: "BP-1", issuedDate: "2019-05-01" }),
        buildPermitRecord({
          permitNumber: "SYNTHETIC-CHESTER-9",
          issuedDate: "2023-02-01",
          provenanceClass: "synthetic_demo",
        }),
      ],
      permitIds: ["BP-1", "SYNTHETIC-CHESTER-9"],
      currentUtcYear: 2026,
    });

    expect(signals.maxOpenPermitYears).toBe(7);
    expect(signals.permitProvenanceClasses).toEqual(["smartgov_ucc", "synthetic_demo"]);
  });

  // Given a permit that was not selected at convert time
  // When signals are resolved
  // Then it contributes neither open years nor provenance
  it("ignores permit rows outside the selected permit ids", () => {
    const signals = resolveLeadPermitSignalsFromPermitRecords({
      permitRecords: [
        buildPermitRecord({ permitNumber: "BP-unselected", issuedDate: "2010-01-01" }),
      ],
      permitIds: ["BP-other"],
      currentUtcYear: 2026,
    });

    expect(signals.maxOpenPermitYears).toBeNull();
    expect(signals.permitProvenanceClasses).toEqual([]);
  });

  // Given a create call that named no permit ids (direct API convert)
  // When signals are resolved from the published permit rows
  // Then open roofing permits are stamped server-side with their contractor
  it("derives open roofing permits server-side when no permit ids were named", () => {
    const signals = resolveLeadPermitSignalsFromPermitRecords({
      permitRecords: [
        buildPermitRecord({
          permitNumber: "SYNTHETIC-CHESTER-0006",
          issuedDate: "2020-01-15",
          contractor: "Valley Forge Demo Exteriors",
          provenanceClass: "synthetic_demo",
        }),
        buildPermitRecord({
          permitNumber: "BP-closed",
          issuedDate: "2015-01-01",
          closedDate: "2016-01-01",
        }),
        buildPermitRecord({
          permitNumber: "BP-well",
          permitType: "Well",
          description: "Well drilling",
          provenanceClass: "county_gis_well",
        }),
      ],
      permitIds: [],
      currentUtcYear: 2026,
    });

    expect(signals.openPermitIds).toEqual(["SYNTHETIC-CHESTER-0006"]);
    expect(signals.contractorName).toBe("Valley Forge Demo Exteriors");
    expect(signals.maxOpenPermitYears).toBe(6);
    expect(signals.permitProvenanceClasses).toEqual(["synthetic_demo"]);
  });

  // Given a selected permit with a published close date
  // When signals are resolved
  // Then closed permits never contribute open years (no invented durations)
  it("excludes closed permits from open-years", () => {
    const signals = resolveLeadPermitSignalsFromPermitRecords({
      permitRecords: [
        buildPermitRecord({
          permitNumber: "BP-closed",
          issuedDate: "2015-01-01",
          closedDate: "2016-01-01",
        }),
      ],
      permitIds: ["BP-closed"],
      currentUtcYear: 2026,
    });

    expect(signals.maxOpenPermitYears).toBeNull();
    expect(signals.permitProvenanceClasses).toEqual(["smartgov_ucc"]);
  });
});
