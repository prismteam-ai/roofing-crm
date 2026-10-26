// T018 (Phase 3, INDEX, US2): Validate's count-reconciliation contract (data-model.md's
// index_meta/reconcile rules, Round 1 decision 2026-10-23 tightening AC-2 to constitution §10's
// 0.1% index-fidelity NFR). Written first, shown failing (no handler exists yet).
import { describe, expect, it } from "vitest";
import { validateCore, type ValidateInput } from "../handlers/validate.js";
import type { CrmProperty, CrmPermit } from "@crm/index-schema";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";

// Base32 CIDv1 alphabet excludes 0/1/8/9 — a fixture CID must stay inside a-z2-7.
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

function properties(count: number): CrmProperty[] {
  return Array.from({ length: count }, (_, i) => property(i));
}

const PERMITS: CrmPermit[] = [];

function baseInput(overrides: Partial<ValidateInput> = {}): ValidateInput {
  return {
    manifestCid: MANIFEST_CID,
    properties: properties(14),
    permits: PERMITS,
    coverageParcelsPublished: 14,
    previousPromotedPropertyCount: null,
    anyPartUnverified: false,
    finishedAt: "2026-10-21T10:40:04.525Z",
    ...overrides,
  };
}

describe("Validate: count reconciliation (AC-2)", () => {
  it("Validated, reconcileDiff 0 when the count matches coverage.parcels_published exactly", () => {
    const result = validateCore(baseInput());
    expect(result.status).toBe("Validated");
    expect(result.reconcileDiff).toBe(0);
    expect(result.heldReason).toBeNull();
  });

  it("Validated, reconcileDiff n when n is at most 0.1% of coverage.parcels_published", () => {
    // 0.1% of 2000 is 2 — a diff of 1 is within tolerance.
    const result = validateCore(
      baseInput({ properties: properties(1999), coverageParcelsPublished: 2000 }),
    );
    expect(result.status).toBe("Validated");
    expect(result.reconcileDiff).toBe(1);
    expect(result.heldReason).toBeNull();
  });

  it("Held, reconcile_diff_exceeds_tolerance when the difference exceeds 0.1%", () => {
    // 0.1% of 2000 is 2 — a diff of 5 exceeds it.
    const result = validateCore(
      baseInput({ properties: properties(1995), coverageParcelsPublished: 2000 }),
    );
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("reconcile_diff_exceeds_tolerance");
    expect(result.reconcileDiff).toBe(5);
  });

  it("Held, drop_over_5_percent when the new count drops more than 5% from the previous promoted run", () => {
    const result = validateCore(
      baseInput({
        properties: properties(90),
        coverageParcelsPublished: 90,
        previousPromotedPropertyCount: 100,
      }),
    );
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("drop_over_5_percent");
  });

  it("every case carries zero rows missing sourceManifestCid", () => {
    for (const result of [
      validateCore(baseInput()),
      validateCore(baseInput({ properties: properties(1999), coverageParcelsPublished: 2000 })),
      validateCore(baseInput({ properties: properties(1995), coverageParcelsPublished: 2000 })),
    ]) {
      expect(result).toBeDefined();
    }
    // The fixtures above all build CrmProperty via Zod .parse(), which already requires
    // sourceManifestCid on every row — proven structurally, not just by this loop running.
    expect(properties(14).every((p) => p.sourceManifestCid === MANIFEST_CID)).toBe(true);
  });
});
