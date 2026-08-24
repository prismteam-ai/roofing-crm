import { describe, expect, it } from "vitest";

import {
  parseCalendarYearFromDateString,
  resolvePropertyPermitOpenYears,
} from "./property-permit-open-years.js";

describe("resolvePropertyPermitOpenYears", () => {
  // Given a closed permit with an opened date
  // When open years are resolved
  // Then null is returned (not ranked as long-open)
  it("returns null when closedDate is published", () => {
    expect(
      resolvePropertyPermitOpenYears({
        openedDate: "2015-04-01",
        issuedDate: null,
        closedDate: "2020-01-01",
        currentUtcYear: 2026,
      }),
    ).toBeNull();
  });

  // Given an open permit with openedDate
  // When open years are resolved against the current UTC year
  // Then the difference is returned
  it("computes years from openedDate when permit is open", () => {
    expect(
      resolvePropertyPermitOpenYears({
        openedDate: "2018-01-01",
        issuedDate: null,
        closedDate: null,
        currentUtcYear: 2026,
      }),
    ).toBe(8);
  });

  // Given no openedDate but a published issuedDate
  // When open years are resolved
  // Then issuedDate is used as the start year
  it("falls back to issuedDate when openedDate is null", () => {
    expect(
      resolvePropertyPermitOpenYears({
        openedDate: null,
        issuedDate: "2019-06-15",
        closedDate: null,
        currentUtcYear: 2026,
      }),
    ).toBe(7);
  });

  // Given no start dates
  // When open years are resolved
  // Then null is returned
  it("returns null when no start date is published", () => {
    expect(
      resolvePropertyPermitOpenYears({
        openedDate: null,
        issuedDate: null,
        closedDate: null,
        currentUtcYear: 2026,
      }),
    ).toBeNull();
  });
});

describe("parseCalendarYearFromDateString", () => {
  it("parses ISO prefix years", () => {
    expect(parseCalendarYearFromDateString("2015-04-01")).toBe(2015);
  });
});
