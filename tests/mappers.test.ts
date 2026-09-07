import { describe, expect, it } from "vitest";
import { creationSummary, priorityFor, toLeadPermits, toNewLead } from "@/lib/leads/mappers";
import { leadSignal, mapPermitRow, mapPropertyRow } from "@/lib/queries/types";

const thresholds = { roofAgeYears: 15, longOpenDays: 1825 };

describe("mapPropertyRow", () => {
  it("coerces BIGINT strings and derives the signal", () => {
    const p = mapPropertyRow(
      {
        request_identifier: "15252900U000710000",
        parcel_identifier: "15252900U000710000",
        address_street: "333 W COLUMBIA AVE",
        address_city: "KISSIMMEE",
        address_zip: "34741",
        latitude: 28.3088,
        longitude: -81.4066,
        built_year: "1984",
        roof_age_years: "41",
        roof_age_basis: "built_year",
        open_roof_permit_count: 1,
        oldest_open_roof_permit_days: 10177,
        permit_count: "27",
        owner_out_of_state: false,
        market_value: 8070600,
        source_urls: "https://a.example | https://b.example | https://a.example",
        distance_miles: "1.234",
      },
      thresholds,
    );
    expect(p.builtYear).toBe(1984);
    expect(p.roofAgeYears).toBe(41);
    expect(p.permitCount).toBe(27);
    expect(p.address).toBe("333 W COLUMBIA AVE, KISSIMMEE, 34741");
    expect(p.sourceUrls).toEqual(["https://a.example", "https://b.example"]);
    expect(p.distanceMiles).toBeCloseTo(1.234);
    expect(p.signal).toBe("long_open_permit");
  });
  it("classifies signals by thresholds", () => {
    expect(
      leadSignal(
        { openRoofPermitCount: 1, oldestOpenRoofPermitDays: 100, roofAgeYears: 3 },
        thresholds,
      ),
    ).toBe("open_permit");
    expect(
      leadSignal(
        { openRoofPermitCount: 0, oldestOpenRoofPermitDays: null, roofAgeYears: 15 },
        thresholds,
      ),
    ).toBe("aged_roof");
    expect(
      leadSignal(
        { openRoofPermitCount: 0, oldestOpenRoofPermitDays: null, roofAgeYears: null },
        thresholds,
      ),
    ).toBe("none");
  });
  it("handles unknown basis and missing address", () => {
    const p = mapPropertyRow({ request_identifier: "X", roof_age_basis: "weird" }, thresholds);
    expect(p.roofAgeBasis).toBe("unknown");
    expect(p.address).toBe("(no situs address)");
  });
});

describe("mapPermitRow", () => {
  it("maps contractor and BBB fields, defaulting booleans", () => {
    const pr = mapPermitRow({
      permit_number: "99-36",
      is_roofing: true,
      is_open: "true",
      days_open: "10198",
      contractor_name: null,
      bbb_rating: null,
    });
    expect(pr.isRoofing).toBe(true);
    expect(pr.isOpen).toBe(true);
    expect(pr.daysOpen).toBe(10198);
    expect(pr.contractorName).toBeNull();
    expect(pr.bbbRating).toBeNull();
  });
});

describe("lead mappers", () => {
  const property = mapPropertyRow(
    {
      request_identifier: "P1",
      address_street: "1 MAIN ST",
      latitude: 1,
      longitude: 2,
      roof_age_years: 30,
      roof_age_basis: "built_year",
      open_roof_permit_count: 0,
    },
    thresholds,
  );
  it("derives priority", () => {
    expect(priorityFor("long_open_permit", null)).toBe("high");
    expect(priorityFor("open_permit", 5)).toBe("medium");
    expect(priorityFor("aged_roof", 30)).toBe("high");
    expect(priorityFor("aged_roof", 16)).toBe("medium");
    expect(priorityFor("none", null)).toBe("low");
  });
  it("builds lead + permit rows and summary", () => {
    const lead = toNewLead(property);
    expect(lead).toMatchObject({
      parcelId: "P1",
      status: "new",
      priority: "high",
      signal: "aged_roof",
      roofAgeYears: 30,
    });
    const permits = toLeadPermits(7, [
      mapPermitRow({
        permit_number: "A",
        is_open: true,
        days_open: 400,
        source_url: "u",
        bbb_rating: "A+",
        bbb_match_method: "license",
      }),
    ]);
    expect(permits[0]).toMatchObject({
      leadId: 7,
      permitNumber: "A",
      isOpen: true,
      daysOpen: 400,
      sourceUrl: "u",
      bbbRating: "A+",
      bbbMatchMethod: "license",
    });
    expect(creationSummary(property, 1)).toContain("Aged roof");
  });
});
