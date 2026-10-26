// T016 (Phase 3, INDEX, US3): feed BuildIndex a fixture row with roof_age_basis recorded as the
// contract's literal missing value ("unknown", per packages/oracle-contract's COLUMN_ENUMS) and no
// permit history; assert the output row preserves that exact reason and contains no
// invented/interpolated roofAgeYears (FR-003). Written first, shown failing.
import { describe, expect, it } from "vitest";
import { buildIndexCore } from "../handlers/buildIndex.js";
import type { ViewRow } from "../handlers/buildIndex.js";

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";
const PROPERTY_CID = "baguqeeraqc3y3bh65rbd42zgdrkctaulckvvidmgb52pghyansb43vumoh6q";
const RUN_CID = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";

/** A parcel near Del Valle with no permit history and no built-year match (spec.md's own
 *  example): roof_age_basis is literally "unknown", roof_age_years is null, and the row's own
 *  `missing` array records why. */
const MISSING_ROOF_AGE_ROW: ViewRow = {
  property_cid: PROPERTY_CID,
  request_identifier: "0208099999",
  latitude: null,
  longitude: null,
  coordinate_source: "none",
  property_type: "SingleFamily",
  property_usage_type: "Residential",
  roof_age_years: null,
  roof_age_basis: "unknown",
  roof_age_confidence: "none",
  is_long_tenure: null,
  tenure_basis: "sale_date",
  owner_name: null,
  owner_kind: null,
  owner_area_class: "unknown",
  owner_is_out_of_area: null,
  missing: [
    { field: "roof_age_years", reason: "no_roof_date" },
    { field: "latitude", reason: "no_coordinates" },
    { field: "longitude", reason: "no_coordinates" },
  ],
  captured_at: "2026-10-21T10:35:59.798Z",
  cid: RUN_CID,
  run_id: "travis-202609-permits-20261021t103516z",
};

const engine = {
  run: async () => undefined,
  all: async (sql: string) => {
    if (sql.includes("v_property")) return [MISSING_ROOF_AGE_ROW];
    if (sql.includes("v_roofing_permit")) return [];
    throw new Error(`unexpected query: ${sql}`);
  },
};

describe("BuildIndex: missing-data preservation (AC-3/FR-003)", () => {
  it("preserves the exact roof-age missing reason, never a guessed or interpolated value", async () => {
    const { properties } = await buildIndexCore(engine, MANIFEST_CID);
    const row = properties[0];

    expect(row?.roofAgeYears).toBeNull();
    expect(row?.roofAgeBasis).toBe("unknown");
    expect(row?.missingReasons).toContainEqual({ field: "roof_age_years", reason: "no_roof_date" });
    // Not guessed: there is no code path from "unknown"/null to any non-null roofAgeYears.
    expect(row?.missingReasons.some((m) => m.field === "roof_age_years")).toBe(true);
  });
});
