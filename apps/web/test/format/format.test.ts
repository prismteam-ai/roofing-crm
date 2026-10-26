// apps/web/src/format: the shared display formatters (dates, enum labels, field-name labels).
// Raw contract values (ISO timestamps, enum codes, column names) must never reach the screen.
import { describe, expect, it } from "vitest";
import {
  contractorResolutionLabel,
  coordinateSourceLabel,
  fieldLabel,
  fieldList,
  formatDate,
  formatDateTimeUtc,
  groupMissing,
  humanizeCode,
  permitStatusLabel,
  permitStatusShortLabel,
  propertyKind,
  roofAgeBasisLabel,
  roofAgeConfidenceLabel,
  ROOF_AGE_BASIS_LABELS,
  ROOF_AGE_CONFIDENCE_LABELS,
} from "../../src/format/index.js";

describe("formatDate", () => {
  it("formats a midnight-UTC instant as that calendar day in every time zone", () => {
    expect(formatDate("2026-09-04T00:00:00.000Z")).toBe("Sep 4, 2026");
  });

  it("formats a date-only value without shifting it a day", () => {
    expect(formatDate("2021-08-09")).toBe("Aug 9, 2021");
  });

  it("returns null for null, empty or unreadable input (the caller says why)", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate("")).toBeNull();
    expect(formatDate("not a date")).toBeNull();
  });

  it("formats a timestamp as a UTC date and time", () => {
    expect(formatDateTimeUtc("2026-10-21T10:35:59Z")).toBe("Oct 21, 2026, 10:35 UTC");
    expect(formatDateTimeUtc(undefined)).toBeNull();
  });
});

describe("enum labels", () => {
  it("covers every roof-age basis and confidence code with a plain-language label", () => {
    for (const code of ["permit", "new_construction", "built_year", "unknown"] as const) {
      expect(roofAgeBasisLabel(code)).toBe(ROOF_AGE_BASIS_LABELS[code]);
      expect(roofAgeBasisLabel(code)).not.toMatch(/_/);
    }
    for (const code of ["high", "medium", "low", "none"] as const) {
      expect(roofAgeConfidenceLabel(code)).toBe(ROOF_AGE_CONFIDENCE_LABELS[code]);
      expect(roofAgeConfidenceLabel(code)[0]).toMatch(/[A-Z]/);
    }
    expect(roofAgeBasisLabel("built_year")).toBe("Year built (no reroof permit found)");
    expect(roofAgeConfidenceLabel("low")).toBe("Low");
  });

  it("labels permit status classes, stalled as derived and a missing one as not published", () => {
    expect(permitStatusShortLabel("open")).toBe("Open");
    expect(permitStatusShortLabel("closed")).toBe("Closed");
    expect(permitStatusLabel("stalled")).toBe("Stalled · derived: no status in source");
    expect(permitStatusLabel(null)).toBe("Status not published");
    expect(permitStatusLabel("some_new_code")).toBe("Some new code");
  });

  it("labels contractor resolution and coordinate source", () => {
    expect(contractorResolutionLabel("resolved")).toBe("Resolved");
    expect(contractorResolutionLabel(null)).toBe("Contractor resolution not published");
    expect(coordinateSourceLabel("gis_centroid")).toBe("Parcel centre (GIS)");
    expect(coordinateSourceLabel("none")).toBe("No coordinates");
  });

  it("humanizes unknown codes rather than showing them raw", () => {
    expect(humanizeCode("SingleFamily")).toBe("Single family");
    expect(humanizeCode("built_year")).toBe("Built year");
    expect(humanizeCode("MobileHomePark")).toBe("Mobile home park");
  });
});

describe("propertyKind", () => {
  it("reads the published usage type (Residential / Commercial), never the structure form", () => {
    expect(propertyKind("Residential", "Building")).toEqual({
      label: "Residential",
      icon: "home",
      published: true,
    });
    expect(propertyKind("commercial", "Building")).toEqual({
      label: "Commercial",
      icon: "storefront",
      published: true,
    });
    expect(propertyKind("SingleFamily", null).label).toBe("Single family");
  });

  it("says 'Type not published' when the usage type is null, even if a structure form exists", () => {
    expect(propertyKind(null, "Building")).toEqual({
      label: "Type not published",
      icon: "help",
      published: false,
    });
  });
});

describe("field labels", () => {
  it("maps contract column names and camelCase index keys to plain language", () => {
    expect(fieldLabel("unnormalized_address")).toBe("Street address");
    expect(fieldLabel("city_name")).toBe("City");
    expect(fieldLabel("postal_code")).toBe("ZIP code");
    expect(fieldLabel("roofAgeYears")).toBe("Roof age");
    expect(fieldLabel("roof_age_years")).toBe("Roof age");
    expect(fieldLabel("propertyUsageType")).toBe("Property use");
    expect(fieldLabel("contractor_name_raw")).toBe("Contractor name as printed");
  });

  it("humanizes a field it has no label for instead of showing the raw name", () => {
    expect(fieldLabel("brand_new_column")).toBe("Brand new column");
  });

  it("lists fields as one readable phrase", () => {
    expect(fieldList(["unnormalized_address", "city_name", "postal_code"])).toBe(
      "Street address, city, ZIP code",
    );
    expect(fieldList([])).toBe("");
  });

  it("groups missing entries by reason with the contract's label and plain field names", () => {
    const groups = groupMissing([
      { field: "unnormalized_address", reason: "not_in_export" },
      { field: "city_name", reason: "not_in_export" },
      { field: "roof_date", reason: "no_roof_date" },
    ]);
    expect(groups).toEqual([
      {
        reason: "not_in_export",
        reasonLabel: "Not included in the published tables",
        fields: ["unnormalized_address", "city_name"],
        fieldsLabel: "Street address, city",
        fieldsInline: "street address, city",
      },
      {
        reason: "no_roof_date",
        reasonLabel: "No roof date found",
        fields: ["roof_date"],
        fieldsLabel: "Roof date",
        fieldsInline: "roof date",
      },
    ]);
  });

  it("keeps an unknown reason visible instead of throwing", () => {
    const [group] = groupMissing([{ field: "x_field", reason: "brand_new_reason" }]);
    expect(group?.reasonLabel).toBe("Brand new reason");
  });
});
