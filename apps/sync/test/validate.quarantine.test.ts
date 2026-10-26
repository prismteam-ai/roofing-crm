// T020 (Phase 3, INDEX, US1 — fixes G5 C-07): given a FetchPart result marking any part as
// DLQ'd/unverified, assert Validate sets status: "Held" for the whole run — a run is never
// promoted with one unverified part, even if every other part verified and the overall
// row-count drop is within tolerance (constitution P0-2/§12.2). Written first, shown failing.
import { describe, expect, it } from "vitest";
import { validateCore, type ValidateInput } from "../handlers/validate.js";
import type { CrmProperty } from "@crm/index-schema";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function fixtureCid(n: number): string {
  const digits = n
    .toString(32)
    .split("")
    .map((d) => BASE32_ALPHABET[parseInt(d, 32) % BASE32_ALPHABET.length])
    .join("");
  return `ba${digits.padEnd(52, "q")}`;
}

function property(n: number): CrmProperty {
  return {
    propertyCid: fixtureCid(n),
    requestIdentifier: `02080${String(n).padStart(5, "0")}`,
    latitude: 30.26,
    longitude: -97.74,
    coordinateSource: "gis_centroid",
    propertyType: "SingleFamily",
    propertyUsageType: "Residential",
    roofAgeYears: 10,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "low",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: "unknown",
    ownerIsOutOfArea: null,
    sourceManifestCid: MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-10-21T10:35:59.798Z",
    cid: RUN_CID,
    runId: "travis-202609-permits-20261021t103516z",
  };
}

function baseInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    manifestCid: MANIFEST_CID,
    properties: Array.from({ length: 14 }, (_, i) => property(i)),
    permits: [],
    coverageParcelsPublished: 14,
    previousPromotedPropertyCount: null,
    anyPartUnverified: false,
    finishedAt: "2026-10-21T10:40:04.525Z",
    ...overrides,
  };
}

describe("Validate: quarantine on any unverified part (T020/T020a)", () => {
  it("holds the whole run when any part is DLQ'd/unverified, even though counts reconcile exactly", () => {
    const result = validateCore(baseInput({ anyPartUnverified: true }));
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("unverified_part");
  });

  it("checks the unverified-part condition before evaluating row counts at all", () => {
    // Counts are nowhere near coverage (would also fail reconcile on its own), proving the
    // unverified-part check is not merely coincidentally first — it is checked unconditionally.
    const result = validateCore(
      baseInput({ anyPartUnverified: true, coverageParcelsPublished: 9999 }),
    );
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("unverified_part");
  });

  it("does not hold on this reason when every part verified", () => {
    const result = validateCore(baseInput({ anyPartUnverified: false }));
    expect(result.heldReason).not.toBe("unverified_part");
  });
});
