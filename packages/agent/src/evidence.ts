import { z } from "zod";
import {
  DomainError,
  type QueryInput,
  type SearchResponse,
} from "../../contracts/src/index";
import {
  permitOpenDays,
  isExplicitOpenRoofPermit,
} from "../../map-domain/src/signals";
export const GroundedSelectionSchema = z
  .object({
    ordinals: z.array(z.number().int().min(0).max(49)).min(1).max(50),
  })
  .strict();
/** The provider schema is narrower than the static parser: only actually projected ordinals exist. */
export function groundedSelectionJsonSchema(ordinals: readonly number[]) {
  if (
    !ordinals.length ||
    ordinals.length > 50 ||
    ordinals.some((n, i) => n !== i)
  )
    throw new DomainError(
      "INVALID_INPUT",
      "Invalid projected evidence ordinal set",
    );
  return {
    type: "object",
    properties: {
      ordinals: {
        type: "array",
        items: { type: "integer", enum: [...ordinals] },
        minItems: 1,
        maxItems: ordinals.length,
        uniqueItems: true,
      },
    },
    required: ["ordinals"],
    additionalProperties: false,
  };
}
export type GroundedRationaleCategory =
  | "roof_age_evidence"
  | "observed_open_permit"
  | "reported_business_license"
  | "observed_bbb_rating"
  | "unknown_evidence"
  | "context_match"
  | "provider_status_evidence"
  | "recorded_deed_gap_evidence";
export function minimizedEvidenceRow(
  row: SearchResponse["rows"][number],
  ordinal: number,
) {
  const permits = row.permits,
    roofing = permits.filter((p) => p.kind !== "other");
  const status = (p: (typeof permits)[number]) =>
    p.statusBasis === "issued_only" ||
    p.statusBasis === "unknown" ||
    (p.status === "open" && !isExplicitOpenRoofPermit(p))
      ? "unknown"
      : p.status;
  const open = roofing.filter(isExplicitOpenRoofPermit),
    days = open
      .map((p) => permitOpenDays(p, row.roof.asOf))
      .filter((x): x is number => x !== null);
  const licenses = permits.flatMap((p) =>
      p.contractor.licenseEvidence ? [p.contractor.licenseEvidence] : [],
    ),
    ratings = permits.flatMap((p) =>
      p.contractor.ratingEvidence ? [p.contractor.ratingEvidence] : [],
    );
  const uniqueLicense = [
      ...new Map(
        licenses.map((e) => [
          JSON.stringify([
            e.identifier,
            e.type,
            e.status,
            e.observedAt,
            e.confidence,
          ]),
          e,
        ]),
      ).values(),
    ],
    uniqueRating = [
      ...new Map(
        ratings.map((e) => [
          JSON.stringify([e.value, e.observedAt, e.matchConfidence]),
          e,
        ]),
      ).values(),
    ];
  return {
    ordinal,
    roof: {
      ageYears: row.roof.ageYears,
      basis: row.roof.basis,
      confidence: row.roof.confidence,
    },
    permits: {
      acquired: permits.length,
      roofing: roofing.length,
      open: open.length,
      closed: roofing.filter((p) => status(p) === "closed").length,
      unknown: roofing.filter((p) => status(p) === "unknown").length,
      oldestOpenDays: days.length ? Math.max(...days) : null,
      oldestOpenObservedAt: days.length
        ? (() => {
            const longest = open.find(
              (p) => permitOpenDays(p, row.roof.asOf) === Math.max(...days),
            )!;
            return longest.statusObservedAt?.slice(0, 10) ?? row.roof.asOf;
          })()
        : null,
    },
    reportedBusinessRole: permits.some((p) => p.contractor.reportedName)
      ? permits.some((p) =>
          p.provenance.some(
            (x) => x.sourceId === "official-troy-issued-permits",
          ),
        )
        ? "business_applicant_not_verified_contractor"
        : "reported_business_role_unverified"
      : "unavailable",
    license: uniqueLicense.slice(0, 1).map((e) => ({
      identifier: e.identifier,
      type: e.type,
      status: e.status,
      observedAt: e.observedAt,
      matchConfidence: e.confidence,
    })),
    licenseObservations: uniqueLicense.length,
    bbb: uniqueRating.slice(0, 1).map((e) => ({
      value: e.value,
      scale: e.scale,
      observedAt: e.observedAt,
      matchConfidence: e.matchConfidence,
    })),
    bbbObservations: uniqueRating.length,
    sourceObservations: permits.flatMap((p) =>
      (p.sourceObservations ?? []).map((source) => ({
        providerStatus: source.providerStatus,
        supportedLifecycle: source.supportedLifecycle,
        activityClaim: source.activityClaim,
        statusBasis: source.statusBasis,
        ageSinceIssueDays: source.ageSinceIssueDays,
        continuousOpenDays: source.continuousOpenDays,
        sourceObservedAt: source.sourceObservedAt,
        assessmentAt: source.assessmentAt,
      })),
    ),
    recordedDeedIndex: (
      row.ownership.recordedTransferIndexObservations ?? []
    ).map((source) => ({
      claimWindowStart: source.claimWindowStart,
      observedThrough: source.observedThrough,
      lastRecordedDeedDate: source.lastRecordedDeedDate,
      noDeedObservedForMoreThanTenYears:
        source.noDeedObservedForMoreThanTenYears,
      ownershipContinuity: source.ownershipContinuity,
      witnessTiming: source.witnessTiming,
    })),
    reportedSale: {
      latestObservedDate:
        (row.ownership.events ?? [])
          .filter((e) => e.kind === "reported_sale")
          .map((e) => e.date)
          .sort()
          .at(-1) ?? null,
      historyCoverage: row.ownership.historyCoverage,
    },
  };
}
/** Categories describe observed minimized facts; the model cannot supply or rewrite them. */
export function rationaleFromMinimizedFacts(
  row: ReturnType<typeof minimizedEvidenceRow>,
  query?: QueryInput,
): GroundedRationaleCategory {
  const age = row.roof.ageYears !== null;
  const open = row.permits.open > 0 && row.permits.oldestOpenDays !== null;
  if (
    query?.minRecordedDeedGapYears !== undefined &&
    row.recordedDeedIndex.length
  )
    return "recorded_deed_gap_evidence";
  if (
    (query?.providerPermitStatus !== undefined ||
      query?.permitActivityClaim !== undefined ||
      query?.minPermitAgeSinceIssueDays !== undefined) &&
    row.sourceObservations.length
  )
    return "provider_status_evidence";
  if (query?.roofMinAgeYears !== undefined)
    return age ? "roof_age_evidence" : "unknown_evidence";
  if (
    (query?.permitStatus === "open" ||
      query?.minOpenDays ||
      query?.sort === "permit_open_days_desc") &&
    open
  )
    return "observed_open_permit";
  if (query?.requiresBbbRating && row.bbb.length) return "observed_bbb_rating";
  if (query?.requiresVerifiedLicense && row.license.length)
    return "reported_business_license";
  if (age) return "roof_age_evidence";
  if (open) return "observed_open_permit";
  if (row.license.length) return "reported_business_license";
  if (row.bbb.length) return "observed_bbb_rating";
  if (row.permits.unknown > 0 || row.permits.acquired === 0)
    return "unknown_evidence";
  return "context_match";
}
export function minimizedEvidenceContext(
  data: SearchResponse,
  rows: ReturnType<typeof minimizedEvidenceRow>[],
) {
  return {
    snapshotId: data.snapshotId,
    queryHash: data.queryHash,
    totalMatched: data.total,
    retrievedRowCount: data.rows.length,
    minimizedRowCount: rows.length,
    rows,
    caveats: [
      "Acquired permits are partial; absence is unknown.",
      "Issued is not open; explicit duration ends at the observed status date.",
      "Roof basis/confidence does not establish installation or replacement.",
      "Reported business applicant is not verified contractor role; license/BBB observations preserve literal status and match confidence.",
      "Reported-sale history is partial and does not establish tenure.",
      "Provider ISSUED alone is not active/open; issue age is not continuous duration. Recorded-deed gaps cover only documented current-PIN windows and never establish legal ownership continuity.",
    ],
  };
}
