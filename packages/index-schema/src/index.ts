// CRM-owned row shapes for crm_property/crm_permit/index_meta (data-model.md). A provenance-
// carrying, query-optimized projection of Task A's contract/v1 — never a re-derivation (ADR-07).
//
// This package is on zod v3 (this workspace's own convention), while the vendored
// packages/oracle-contract is pinned to zod v4 (ADR-07's vendor-verbatim rule) — the two majors'
// schema internals don't compose, so only plain data (the MISSING_REASONS string array, the
// isCidV1 predicate) crosses that boundary, never a cross-major schema instance.
import { z } from "zod";
import { isCidV1 } from "@crm/oracle-contract/cid";
import { MISSING_REASONS } from "@crm/oracle-contract";

export const CidV1 = z.string().refine(isCidV1, { message: "expected a base32 CIDv1 string" });

export const MissingReason = z.enum(MISSING_REASONS);
export type MissingReason = z.infer<typeof MissingReason>;

export const Missing = z.object({ field: z.string().min(1), reason: MissingReason });
export type Missing = z.infer<typeof Missing>;

/** Provenance fields carried verbatim onto every crm_property/crm_permit row (architecture-constitution.md §7). */
export const ProvenanceFields = {
  sourceManifestCid: CidV1,
  missingReasons: z.array(Missing),
  capturedAt: z.string(),
  cid: CidV1,
  runId: z.string().min(1),
};

export const CrmProperty = z
  .object({
    propertyCid: CidV1,
    requestIdentifier: z.string().min(1),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    // contract v1.1 (Run 3): condo units without a GIS point get one from the City of Austin
    // address-point layer, only on an exact single-point match (Task A ADR 0004).
    coordinateSource: z.enum(["gis_centroid", "address_point", "permit_point", "none"]),
    propertyType: z.string().nullable(),
    propertyUsageType: z.string().nullable(),
    // Never guessed or interpolated (AC-3/FR-003) — null + its missingReasons entry is the only
    // way this field is ever empty.
    roofAgeYears: z.number().int().nullable(),
    roofAgeBasis: z.enum(["permit", "new_construction", "built_year", "unknown"]),
    roofAgeConfidence: z.enum(["high", "medium", "low", "none"]),
    isLongTenure: z.boolean().nullable(),
    // contract v1.1 (Run 3): how tenure was dated — a TCAD sale, a TCAD transfer deed, or neither.
    tenureBasis: z.enum(["sale_date", "deed_date", "unknown"]).nullable(),
    // Owner display name from contract v1.1 (owners parsed into people and companies). ADR-03 was
    // amended 2026-10-25 (PO): shown on the property screen, still never sent to the model. Null
    // carries its missing reason (owner_unparsed, owner_confidential, no_owner_record, ...).
    ownerName: z.string().nullable(),
    // contract v1.2 (Run 3.1): the situs as TCAD prints it (one line: street, city, state, ZIP), and the
    // current owners' mailing ZIP (5 digits) and state, "; "-separated when co-owners differ. Optional:
    // an index built before Run 3.1 has no such columns. Situs city and ZIP are NOT separate fields.
    unnormalizedAddress: z.string().nullable().optional(),
    ownerMailingPostalCode: z.string().nullable().optional(),
    ownerMailingStateCode: z.string().nullable().optional(),
    // contract v1.1 views carry these too; added to the index afterwards (additive), so rows from
    // an index built earlier lack them: optional on read, nullable when present. A null carries its
    // missing reason (source_missing, no_dated_sale).
    structureBuiltYear: z.number().int().nullable().optional(),
    lastSaleDate: z.string().nullable().optional(),
    tenureYears: z.number().int().nullable().optional(),
    // The source record URL (TCAD file) Task A publishes; rendered as a link only when https.
    sourceUrl: z.string().nullable().optional(),
    ownerKind: z.enum(["person", "company", "unknown"]).nullable(),
    ownerAreaClass: z.enum(["in_county", "regional", "out_of_area", "unknown"]).nullable(),
    ownerIsOutOfArea: z.boolean().nullable(),
    ...ProvenanceFields,
  })
  .strict();
export type CrmProperty = z.infer<typeof CrmProperty>;

export const CrmPermit = z
  .object({
    propertyCid: CidV1,
    permitCid: CidV1,
    jurisdiction: z.string().nullable(),
    permitNumber: z.string().nullable(),
    improvementType: z.string(),
    improvementAction: z.string(),
    improvementStatus: z.string().nullable(),
    // Read verbatim from the vendored query-core derivation (ADR-07) — never recomputed here. A
    // null improvementStatus must already have arrived as statusClass "stalled" (constitution P0-4).
    statusClass: z.string().nullable(),
    issueDate: z.string().nullable(),
    finalDate: z.string().nullable(),
    permitCloseDate: z.string().nullable(),
    finalInspectionDate: z.string().nullable(),
    openDays: z.number().int().nullable(),
    contractorResolution: z.string().nullable(),
    contractorCompanyCid: CidV1.nullable(),
    // contract v1.1 (Run 3, ERR-32): the contractor exactly as the permit prints it — unverified,
    // not a registry identity — and the BBB state Task A derives from it. No rating is ever
    // published (BBB blocks the lookup); bbbUrl is a search link Task A builds, never fetched.
    contractorNameAsPrinted: z.string().nullable(),
    bbbStatus: z.enum(["rated", "not_found", "blocked", "not_checked"]).nullable(),
    bbbStatusReason: z.string().nullable(),
    bbbUrl: z.string().nullable(),
    // contract v1.1 source record URL (Austin open-data permit record); optional on read for rows
    // from an index built before it was carried.
    sourceUrl: z.string().nullable().optional(),
    ...ProvenanceFields,
  })
  .strict();
export type CrmPermit = z.infer<typeof CrmPermit>;

export const IndexMetaStatus = z.enum([
  "Validating",
  "Validated",
  "Held",
  "Promoted",
  "Quarantined",
]);
export type IndexMetaStatus = z.infer<typeof IndexMetaStatus>;

export const IndexMetaHeldReason = z.enum([
  "lineage_fork",
  "stale_finished_at",
  "cost_gate_exceeded",
  "drop_over_5_percent",
  "digest_mismatch",
  "reconcile_diff_exceeds_tolerance",
  // T020/T020a (G5 C-07): a run with any DLQ'd/unverified FetchPart part is held on that
  // condition alone, checked before row counts are evaluated at all (constitution P0-2: "a run
  // with a failed part is never promoted" — even if every other part verified and the overall
  // count drop is within tolerance).
  "unverified_part",
  // B-09: crm_permit's row count differs from the manifest's own `coverage.permits_emitted` —
  // exactly Task A's publish gate (v_roofing_permit = permits_emitted), so no tolerance.
  "permit_reconcile_mismatch",
  // B-09 review fix: full-county manifests publish no parcel count, so on a first run (no
  // previously promoted count either) these are the property-count checks that still run.
  // crm_property has no rows at all — never a servable index, whatever the manifest says.
  "zero_properties",
  // A manifest batch holding a table the views read was never bound (query-core's bindManifest
  // skips a batch whose data group it can't resolve rather than guess) — a partial index.
  "unbound_batch",
  // A county batch was bound but contributed no county.property rows — a partial index.
  "empty_county_batch",
]);
export type IndexMetaHeldReason = z.infer<typeof IndexMetaHeldReason>;

/** B-09: whether a count reconcile ran, or Task A's manifest publishes no count to check against
 *  (full-county manifests carry no `coverage.parcels_published`). Never a fake number. */
export const CountCheck = z.enum(["reconciled", "not_published_by_task_a"]);
export type CountCheck = z.infer<typeof CountCheck>;

export const IndexMeta = z
  .object({
    manifestCid: CidV1,
    status: IndexMetaStatus,
    propertyCount: z.number().int().nonnegative(),
    permitCount: z.number().int().nonnegative(),
    /** Property count vs `coverage.parcels_published`; null when Task A does not publish it. */
    reconcileDiff: z.number().int().nullable(),
    heldReason: IndexMetaHeldReason.nullable(),
    finishedAt: z.string(),
    /** B-09: which count checks ran (absent on pre-B-09 records). */
    propertyCountCheck: CountCheck.optional(),
    permitCountCheck: CountCheck.optional(),
    /** crm_permit rows minus `coverage.permits_emitted`; null when not published. */
    permitReconcileDiff: z.number().int().nullable().optional(),
  })
  .strict();
export type IndexMeta = z.infer<typeof IndexMeta>;

export type Provenanced<T> = T & {
  sourceManifestCid: string;
};
