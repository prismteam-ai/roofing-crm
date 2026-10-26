import { describe, expect, it } from "vitest";
import { contractorSnapshot } from "../../src/leads/mainLeadPermit.js";

describe("contractorSnapshot", () => {
  it("keeps the printed name (trimmed) and the BBB state, and marks it recorded", () => {
    expect(
      contractorSnapshot({ contractorNameAsPrinted: " ACME ROOFING ", bbbStatus: "blocked" }),
    ).toEqual({ contractor: "ACME ROOFING", bbbStatus: "blocked", contractorRecorded: true });
  });

  it("with no printed name it is recorded but has no contractor", () => {
    expect(contractorSnapshot({ contractorNameAsPrinted: "  ", bbbStatus: null })).toEqual({
      contractorRecorded: true,
    });
  });

  it("with no permit it records nothing", () => {
    expect(contractorSnapshot(null)).toEqual({});
  });
});
