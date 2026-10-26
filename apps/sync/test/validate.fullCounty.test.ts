// B-09: Validate against full-county Task A manifests. They carry no `coverage.parcels_published`
// (today's reconcile would hold every full-county run against a defaulted 0), but they do carry
// `coverage.permits_emitted` — and Task A's own publish gate is exactly
// `v_roofing_permit = permits_emitted`. So: reconcile crm_permit against permits_emitted (exact),
// keep the parcels reconcile only when parcels_published is present, and record the property
// check as `not_published_by_task_a` (typed, never a fake number) when it is absent. The
// unverified-part and >5%-drop holds are unchanged.
import { describe, expect, it } from "vitest";
import type { CrmPermit, CrmProperty } from "@crm/index-schema";
import { validateCore, type ValidateInput } from "../handlers/validate.js";

const RUN_1_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";
const RUN_2_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";

/** validateCore reads only the row count and each row's sourceManifestCid. */
function rows<T>(count: number, manifestCid: string): T[] {
  return Array.from({ length: count }, () => ({ sourceManifestCid: manifestCid }) as T);
}

function input(overrides: Partial<ValidateInput> & { manifestCid?: string } = {}): ValidateInput {
  const manifestCid = overrides.manifestCid ?? RUN_2_MANIFEST_CID;
  return {
    manifestCid,
    properties: rows<CrmProperty>(441_961, manifestCid),
    permits: rows<CrmPermit>(15_025, manifestCid),
    coverageParcelsPublished: null,
    coveragePermitsEmitted: 15_025,
    previousPromotedPropertyCount: null,
    anyPartUnverified: false,
    finishedAt: "2026-10-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("Validate: full-county manifests (B-09)", () => {
  it("Validated when crm_permit equals coverage.permits_emitted and parcels_published is absent", () => {
    const meta = validateCore(input());
    expect(meta).toMatchObject({
      status: "Validated",
      heldReason: null,
      propertyCount: 441_961,
      permitCount: 15_025,
      permitCountCheck: "reconciled",
      permitReconcileDiff: 0,
      propertyCountCheck: "not_published_by_task_a",
      reconcileDiff: null,
    });
  });

  it("holds Run 1 on its permit reconcile: 0 crm_permit rows vs 17,387 permits_emitted (Task A's own identity gate)", () => {
    const meta = validateCore(
      input({
        manifestCid: RUN_1_MANIFEST_CID,
        properties: rows<CrmProperty>(441_961, RUN_1_MANIFEST_CID),
        permits: [],
        coveragePermitsEmitted: 17_387,
      }),
    );
    expect(meta).toMatchObject({
      status: "Held",
      heldReason: "permit_reconcile_mismatch",
      permitCount: 0,
      permitReconcileDiff: -17_387,
      permitCountCheck: "reconciled",
      propertyCountCheck: "not_published_by_task_a",
    });
  });

  it("allows no tolerance on the permit reconcile (Task A's gate is exact equality)", () => {
    const meta = validateCore(input({ permits: rows<CrmPermit>(15_024, RUN_2_MANIFEST_CID) }));
    expect(meta).toMatchObject({ status: "Held", heldReason: "permit_reconcile_mismatch" });
  });

  it("records the permit check as not published when permits_emitted is absent (no fake number)", () => {
    const meta = validateCore(input({ coveragePermitsEmitted: null }));
    expect(meta).toMatchObject({
      status: "Validated",
      permitCountCheck: "not_published_by_task_a",
      permitReconcileDiff: null,
    });
  });

  it("still reconciles properties against parcels_published when Task A publishes it (sample manifests)", () => {
    const meta = validateCore(
      input({
        properties: rows<CrmProperty>(14, RUN_2_MANIFEST_CID),
        coverageParcelsPublished: 14,
        permits: rows<CrmPermit>(35, RUN_2_MANIFEST_CID),
        coveragePermitsEmitted: 35,
      }),
    );
    expect(meta).toMatchObject({
      status: "Validated",
      propertyCountCheck: "reconciled",
      reconcileDiff: 0,
    });
    const off = validateCore(
      input({
        properties: rows<CrmProperty>(10, RUN_2_MANIFEST_CID),
        coverageParcelsPublished: 14,
      }),
    );
    expect(off).toMatchObject({ status: "Held", heldReason: "reconcile_diff_exceeds_tolerance" });
  });

  it("keeps the unverified-part hold first, ahead of every count check", () => {
    const meta = validateCore(input({ anyPartUnverified: true, permits: [] }));
    expect(meta).toMatchObject({ status: "Held", heldReason: "unverified_part" });
  });

  it("keeps the >5% drop hold against the previously promoted run", () => {
    const meta = validateCore(input({ previousPromotedPropertyCount: 500_000 }));
    expect(meta).toMatchObject({ status: "Held", heldReason: "drop_over_5_percent" });
  });

  // --- B-09 review fix: a full-county first run (no parcels_published, no previous promoted
  // run) used to get no property-count check at all, so 0 rows or a partial bind validated. ---

  const FULL_COVERAGE = { batchesListed: 12, unboundBatches: [], emptyCountyBatches: [] };

  it("always holds a run with zero properties — even with no published count and no previous run", () => {
    for (const coverageParcelsPublished of [null, 0]) {
      const meta = validateCore(
        input({ properties: [], coverageParcelsPublished, batchCoverage: FULL_COVERAGE }),
      );
      expect(meta).toMatchObject({
        status: "Held",
        heldReason: "zero_properties",
        propertyCount: 0,
      });
    }
  });

  it("holds a full-county first run when a manifest batch was never bound (bindManifest skipped it)", () => {
    const meta = validateCore(
      input({
        batchCoverage: { ...FULL_COVERAGE, unboundBatches: ["run/county-batched/tables/b07"] },
      }),
    );
    expect(meta).toMatchObject({ status: "Held", heldReason: "unbound_batch" });
  });

  it("holds a full-county first run when a county batch contributed no property rows", () => {
    const meta = validateCore(
      input({
        batchCoverage: { ...FULL_COVERAGE, emptyCountyBatches: ["run/county-batched/tables/b03"] },
      }),
    );
    expect(meta).toMatchObject({ status: "Held", heldReason: "empty_county_batch" });
  });

  it("validates a full-county first run whose every batch was bound and contributed rows", () => {
    const meta = validateCore(input({ batchCoverage: FULL_COVERAGE }));
    expect(meta).toMatchObject({ status: "Validated", heldReason: null });
  });

  it("keeps the unverified-part hold ahead of the new holds", () => {
    const meta = validateCore(
      input({
        anyPartUnverified: true,
        properties: [],
        batchCoverage: { ...FULL_COVERAGE, unboundBatches: ["x"] },
      }),
    );
    expect(meta).toMatchObject({ status: "Held", heldReason: "unverified_part" });
  });
});
