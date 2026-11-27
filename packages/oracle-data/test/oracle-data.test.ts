import { SearchInput } from "@crm/shared";
import { describe, expect, test } from "vitest";
import {
  createOracleData,
  OracleContractError,
  OracleManifestMismatch,
  OracleUnavailable,
  scoreCandidate,
} from "../src/index.ts";
import { CID, fakeOracle, FTL, OTHER_CID, permit, property } from "./fake-oracle.ts";

const oracle = (f: ReturnType<typeof fakeOracle>, timeoutMs = 10_000) =>
  createOracleData({ apiUrl: "http://oracle.test", expectedManifestCid: CID, fetchImpl: f.fetch, timeoutMs });
const search = (over: Partial<SearchInput> = {}) => SearchInput.parse({ center: FTL, ...over });

describe("search", () => {
  test("merges aged roofs and open permits into one candidate per property", async () => {
    const f = fakeOracle({
      properties: [property(), property({ parcel_identifier: "504203010020", roof_age_years: 18 })],
      permits: [
        permit(),
        permit({ permit_key: "ftl:R-2", parcel_identifier: "504203010030", lat: 26.13, lon: -80.15 }),
      ],
    });
    const r = await oracle(f).search(search());
    expect(r.candidates.map((c) => c.propertyId).sort()).toEqual([
      "504203010010",
      "504203010020",
      "504203010030",
    ]);
    const both = r.candidates.find((c) => c.propertyId === "504203010010")!;
    expect(both.roofAgeYears).toBe(25);
    expect(both.openRoofPermits).toHaveLength(1);
    expect(r.manifestCid).toBe(CID);
  });

  test("candidates sort by score, long-open permits first among ties", async () => {
    const f = fakeOracle({
      permits: [
        permit({ permit_key: "a", parcel_identifier: "A", open_days: 400, open_years: 1.1 }),
        permit({ permit_key: "b", parcel_identifier: "B", open_days: 700, open_years: 1.9 }),
        permit({ permit_key: "c", parcel_identifier: "C", open_days: 3000, open_years: 8.2 }),
      ],
    });
    const r = await oracle(f).search(search({ layers: ["open_permits"] }));
    // A and B both score 35 (one full open year); B has been open longer.
    expect(r.candidates.map((c) => [c.propertyId, c.score])).toEqual([
      ["C", 30 + 25],
      ["B", 35],
      ["A", 35],
    ]);
  });

  test("a pin outside Broward returns outsideCoverage and calls no Oracle API", async () => {
    const f = fakeOracle({ properties: [property()] });
    const r = await oracle(f).search(search({ center: { lat: 26.1, lon: -79.8 } })); // Atlantic Ocean
    expect(r).toMatchObject({ candidates: [], outsideCoverage: true });
    expect(f.calls).toEqual([]);
  });

  test("jurisdictions in the radius without permit data are reported", async () => {
    const f = fakeOracle({
      properties: [property()],
      uncovered: [{ name: "City of Plantation", status: "skipped", parcels: 9 }],
    });
    expect((await oracle(f).search(search())).permitGaps).toEqual(["City of Plantation"]);
  });

  test("rows of another run are refused, never mixed in", async () => {
    const f = fakeOracle({ properties: [property({ manifest_cid: OTHER_CID })] });
    await expect(oracle(f).search(search())).rejects.toBeInstanceOf(OracleManifestMismatch);
  });

  test("a permit-status filter keeps only those permits", async () => {
    const f = fakeOracle({
      permits: [permit(), permit({ permit_key: "x", parcel_identifier: "X", status: "needs_review" })],
    });
    const r = await oracle(f).search(search({ layers: ["open_permits"], permitStatus: ["needs_review"] }));
    expect(r.candidates.map((c) => c.propertyId)).toEqual(["X"]);
  });
});

describe("scoreCandidate", () => {
  test("22-year roof + permit open 6 years, threshold 15 → 109 with both reasons", () => {
    const c = {
      propertyId: "p",
      propertyCid: null,
      address: null,
      city: null,
      lat: 0,
      lon: 0,
      roofAgeYears: 22,
      roofAgeBasis: "year_built",
      openRoofPermits: [
        {
          permitId: "x",
          openDays: 6 * 365.25,
          status: "open" as const,
          contractorName: "Acme",
          contractorLicenseStatus: "C",
          bbbGrade: null,
        },
      ],
    };
    const s = scoreCandidate(c, { minRoofAgeYears: 15 });
    expect(s.score).toBe(54 + 55);
    expect(s.reasons).toEqual([
      "Roof 22 years old (threshold 15; basis: year built)",
      "Roofing permit open 6 years",
    ]);
  });

  test("a contractor with a non-current DBPR status or a D/F BBB grade adds 10", () => {
    const base = {
      propertyId: "p",
      propertyCid: null,
      address: null,
      city: null,
      lat: 0,
      lon: 0,
      roofAgeYears: null,
      roofAgeBasis: "unknown",
    };
    const p = {
      permitId: "x",
      openDays: 10,
      status: "open" as const,
      contractorName: "Acme",
      contractorLicenseStatus: "C",
      bbbGrade: null,
    };
    expect(scoreCandidate({ ...base, openRoofPermits: [p] }, { minRoofAgeYears: 15 }).score).toBe(30);
    expect(
      scoreCandidate(
        { ...base, openRoofPermits: [{ ...p, contractorLicenseStatus: "S" }] },
        { minRoofAgeYears: 15 },
      ).score,
    ).toBe(40);
    expect(
      scoreCandidate({ ...base, openRoofPermits: [{ ...p, bbbGrade: "F" }] }, { minRoofAgeYears: 15 }).score,
    ).toBe(40);
  });
});

describe("health and failures", () => {
  test("health reports a mismatch when the Oracle serves another run", async () => {
    expect(await oracle(fakeOracle({ manifestCid: OTHER_CID })).health()).toEqual({
      ok: true,
      manifestCid: OTHER_CID,
      mismatch: true,
    });
    expect(await oracle(fakeOracle({})).health()).toEqual({ ok: true, manifestCid: CID, mismatch: false });
  });

  test("timeout and 5xx are typed OracleUnavailable errors", async () => {
    await expect(oracle(fakeOracle({ fail: "timeout" }), 50).search(search())).rejects.toBeInstanceOf(
      OracleUnavailable,
    );
    await expect(oracle(fakeOracle({ fail: 500 })).search(search())).rejects.toBeInstanceOf(
      OracleUnavailable,
    );
  });

  test("a response failing the contract schema is rejected", async () => {
    await expect(oracle(fakeOracle({ fail: "bad-shape" })).search(search())).rejects.toBeInstanceOf(
      OracleContractError,
    );
  });
});

describe("details", () => {
  test("property, signals, hasProperty and resolvePlace", async () => {
    const o = oracle(fakeOracle({ properties: [property()] }));
    expect((await o.property("504203010010"))?.property.address).toBe("100 SE 1st Ave");
    expect(await o.property("nope")).toBeNull();
    expect(await o.hasProperty("nope")).toBe(false);
    expect(await o.signalsFor("504203010010")).toEqual({
      roofAgeYears: 25,
      roofAgeBasis: "year_built",
      maxOpenDays: null,
      bbbGrade: null,
      ownerLocationClass: "in_county",
    });
    expect(await o.resolvePlace("Fort Lauderdale")).toEqual({ name: "Fort Lauderdale", ...FTL });
    expect(await o.resolvePlace("Springfield")).toBeNull();
  });
});
