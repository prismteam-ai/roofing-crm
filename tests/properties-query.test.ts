import { describe, expect, it } from "vitest";
import {
  buildCandidateCountQuery,
  buildCandidateQuery,
  buildPropertiesByIdsQuery,
  buildPropertyByIdQuery,
  searchParamsSchema,
} from "@/lib/queries/properties";

const base = { lat: 28.2919, lng: -81.4076, radiusMiles: 5 };

describe("searchParamsSchema", () => {
  it("applies defaults and coerces URL strings", () => {
    const p = searchParamsSchema.parse({
      lat: "28.29",
      lng: "-81.4",
      openPermitsOnly: "false",
      longOpenYears: "",
    });
    expect(p.roofAgeMin).toBe(15);
    expect(p.openPermitsOnly).toBe(false);
    expect(p.longOpenYears).toBeNull();
    expect(p.limit).toBe(500);
  });
  it("treats 'true' as true and clamps radius", () => {
    expect(searchParamsSchema.parse({ ...base, ownerOutOfState: "true" }).ownerOutOfState).toBe(
      true,
    );
    expect(() => searchParamsSchema.parse({ ...base, radiusMiles: 99 })).toThrow();
  });
});

describe("buildCandidateQuery", () => {
  it("defaults to aged roofs OR open permits within radius, ordered by priority", () => {
    const { sql } = buildCandidateQuery(base);
    expect(sql).toContain("FROM properties");
    expect(sql).toContain("(roof_age_years >= 15 OR open_roof_permit_count > 0)");
    expect(sql).toContain("<= 5");
    expect(sql).toMatch(/ORDER BY CASE WHEN open_roof_permit_count > 0 THEN 0 ELSE 1 END/);
    expect(sql).toMatch(/LIMIT 500$/);
    expect(sql).not.toMatch(/'/); // no string literals at all in the default query
  });
  it("narrows to long-open permits and other toggles", () => {
    const { sql } = buildCandidateQuery({
      ...base,
      longOpenYears: 5,
      ownerOutOfState: true,
      noSaleYears: 10,
      propertyType: "residential",
      roofAgeMin: 20,
    });
    expect(sql).toContain("open_roof_permit_count > 0");
    expect(sql).toContain("oldest_open_roof_permit_days >= 1825");
    expect(sql).toContain("owner_out_of_state = true");
    expect(sql).toContain("years_since_sale >= 10");
    expect(sql).toContain("property_type = 'residential'");
    expect(sql).not.toContain("roof_age_years >= 20 OR");
  });
  it("agedRoofsOnly drops the open-permit OR branch so the threshold drives the list", () => {
    const { sql } = buildCandidateQuery({ ...base, agedRoofsOnly: "true", roofAgeMin: 40 });
    expect(sql).toContain("roof_age_years >= 40");
    expect(sql).not.toContain("OR open_roof_permit_count");
    expect(sql).not.toMatch(/AND open_roof_permit_count > 0/);
    // openPermitsOnly still works on its own; agedRoofsOnly wins when both are sent.
    expect(buildCandidateQuery({ ...base, openPermitsOnly: true }).sql).toMatch(
      /AND open_roof_permit_count > 0/,
    );
    expect(
      buildCandidateQuery({ ...base, openPermitsOnly: true, agedRoofsOnly: true }).sql,
    ).toContain("roof_age_years >= 15");
  });
  it("adds the BBB-rated-contractor filter and count", () => {
    const { sql } = buildCandidateQuery({ ...base, ratedContractorOnly: "true" });
    expect(sql).toContain("has_bbb_contractor = true");
    expect(buildCandidateQuery(base).sql).not.toContain("has_bbb_contractor = true");
    expect(buildCandidateCountQuery(base).sql).toContain(
      "FILTER (WHERE has_bbb_contractor) AS bbb_parcels",
    );
  });
  it("never interpolates raw strings from input", () => {
    expect(() => buildCandidateQuery({ ...base, propertyType: "x' OR 1=1" })).toThrow();
    expect(() => buildCandidateQuery({ ...base, sort: "DROP" })).toThrow();
    expect(() => buildCandidateQuery({ ...base, lat: "28.29; DROP" })).toThrow();
  });
  it("builds a matching count query", () => {
    const { sql } = buildCandidateCountQuery({ ...base, longOpenYears: 5 });
    expect(sql).toContain("count(*) AS total");
    expect(sql).toContain("oldest_open_roof_permit_days >= 1825) AS long_open_permits");
  });
});

describe("id queries", () => {
  it("builds detail and multi-id queries with validated literals", () => {
    expect(buildPropertyByIdQuery("15252900U000710000")).toContain(
      "request_identifier = '15252900U000710000'",
    );
    expect(buildPropertiesByIdsQuery(["A1", "B2"])).toContain("IN ('A1', 'B2')");
    expect(() => buildPropertiesByIdsQuery(["A1", "x'y"])).toThrow(RangeError);
    expect(() => buildPropertiesByIdsQuery([])).toThrow(RangeError);
  });
});
