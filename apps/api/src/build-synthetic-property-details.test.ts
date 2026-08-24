import { describe, expect, it } from "vitest";

import {
  applySyntheticPropertyDetails,
  buildSyntheticPropertyPermitDetails,
  hashPropertyIdSeed,
  propertyNeedsDetailEnrichment,
} from "./build-synthetic-property-details.js";
import type { OraclePropertyRecord } from "./routers/properties.js";

describe("buildSyntheticPropertyPermitDetails", () => {
  it("returns deterministic SYNTHETIC- roofing permits for a property id", () => {
    const first = buildSyntheticPropertyPermitDetails({
      propertyId: "lee-prop-abc",
      permitCount: 1,
      currentUtcYear: 2026,
    });
    const second = buildSyntheticPropertyPermitDetails({
      propertyId: "lee-prop-abc",
      permitCount: 1,
      currentUtcYear: 2026,
    });

    expect(first).toEqual(second);
    expect(first[0]?.permitId).toMatch(/^SYNTHETIC-/);
    expect(first[0]?.permitType).toBe("Roofing");
    expect(first[0]?.status).toBe("Open");
    expect(first[0]?.contractorName).toBeTruthy();
  });

  it("produces open durations between five and twelve years", () => {
    const permits = buildSyntheticPropertyPermitDetails({
      propertyId: "lee-prop-duration",
      permitCount: 1,
      currentUtcYear: 2026,
    });
    const issueYear = Number.parseInt(permits[0]?.issuedDate?.slice(0, 4) ?? "0", 10);
    const openYears = 2026 - issueYear;
    expect(openYears).toBeGreaterThanOrEqual(5);
    expect(openYears).toBeLessThanOrEqual(12);
  });
});

describe("propertyNeedsDetailEnrichment", () => {
  it("is true when flags are set but detail rows are missing", () => {
    const oraclePropertyRecord: OraclePropertyRecord = {
      propertyId: "lee-prop-1",
      hasPermits: true,
      permitCount: 1,
      hasBbbContractor: true,
    };

    expect(propertyNeedsDetailEnrichment(oraclePropertyRecord, [], null)).toBe(true);
  });
});

describe("applySyntheticPropertyDetails", () => {
  it("fills permits and BBB when flags are set", () => {
    const oraclePropertyRecord: OraclePropertyRecord = {
      propertyId: "lee-prop-synth",
      hasPermits: true,
      permitCount: 1,
      hasBbbContractor: true,
    };

    const result = applySyntheticPropertyDetails({
      oraclePropertyRecord,
      resolvedPermits: [],
      resolvedBbb: null,
      currentUtcYear: 2026,
    });

    expect(result.permits).toHaveLength(1);
    expect(result.permits[0]?.permitId).toMatch(/^SYNTHETIC-/);
    expect(result.bbb?.ratingLetter).toBeTruthy();
    expect(hashPropertyIdSeed("lee-prop-synth")).toBeGreaterThan(0);
  });
});
