// B-09 review finding 11 (CR-B-09, alakazam): the citation verifier used to check citation *ids*
// only, so a claim could cite a real row and still state a wrong roof age or count. `checkClaimText`
// is the deterministic (no model call) text check: every number in a claim must equal a value in
// its cited rows or a server-computed count, and any identifier it names must be a cited row's.
import { describe, expect, it } from "vitest";
import { checkClaimText, type ClaimTextFacts } from "../../../src/services/agent/claimText.js";

const CID_A = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CID_B = "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function facts(overrides: Partial<ClaimTextFacts> = {}): ClaimTextFacts {
  return {
    citedNumbers: [32, 30.4118, -97.7069],
    citedIdentifiers: ["R-0001", CID_A],
    turnIdentifiers: ["R-0001", "R-0002", CID_A, CID_B],
    allowedNumbers: [3, 5, 15],
    citedRowCount: 1,
    ...overrides,
  };
}

describe("checkClaimText", () => {
  it("passes a claim whose numbers all come from the cited row or the counts", () => {
    expect(
      checkClaimText("R-0001 has a 32-year-old roof, 1 of 3 matches within 5 mi.", facts()),
    ).toEqual({ ok: true });
  });

  it("accepts formatting variants: rounding to the claim's precision, sign, thousands separators", () => {
    const f = facts({ citedNumbers: [30.4118, -97.7069, 1234], allowedNumbers: [] });
    expect(checkClaimText("Centre 30.41, -97.71; open 1,234 days.", f).ok).toBe(true);
    // A whole number may be the floor of a fractional value ("3 years" for 3.38 years open).
    expect(checkClaimText("Open about 3 years.", facts({ citedNumbers: [3.38] })).ok).toBe(true);
  });

  it("fails a claim that states a roof age the cited row does not carry", () => {
    const result = checkClaimText("R-0001 has a 40-year-old roof.", facts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("40");
  });

  it("fails a claim that states a count the server did not compute", () => {
    expect(checkClaimText("There are 12 matching properties.", facts()).ok).toBe(false);
  });

  it("fails a claim naming a TCAD id from this turn that it does not cite", () => {
    const result = checkClaimText("R-0002 also qualifies.", facts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("R-0002");
  });

  it("fails a claim naming a CID it does not cite (from this turn or invented)", () => {
    expect(checkClaimText(`See ${CID_B}.`, facts()).ok).toBe(false);
    expect(checkClaimText("See bafkreiFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE.", facts()).ok).toBe(
      false,
    );
  });

  it("does not read digits inside a word (e.g. 'ZCTA5') as a stated number", () => {
    expect(checkClaimText("Inside ZCTA5 78753.", facts({ allowedNumbers: [78753] })).ok).toBe(true);
  });

  it("counts the claim's own cited-row count as an allowed number ('these 2 properties')", () => {
    expect(
      checkClaimText("These 2 properties qualify.", facts({ citedRowCount: 2, allowedNumbers: [] }))
        .ok,
    ).toBe(true);
  });
});
