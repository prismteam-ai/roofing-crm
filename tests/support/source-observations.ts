import {
  ProviderPermitObservationSchema,
  RecordedTransferIndexObservationSchema,
  PropertySchema,
  type ProviderPermitObservation,
} from "../../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./evidence-fixture";
export const SOURCE_SNAPSHOT = "synthetic-source-closure";
export const SOURCE_PROPERTY_ID = "SYN-SOURCE-CLOSURE";
export const PRIVATE_PARTY_CANARY =
  "SYNTHETIC_PRIVATE_PARTY_NEVER_MODEL_OR_TELEMETRY";
export const PRIVATE_LICENSE_CANARY = "SYNTHETIC_PRIVATE_LICENSE_NEVER_MODEL";
const hash = "a".repeat(64),
  stamp = "2026-10-28T20:00:00.000Z";
export function providerObservation(
  overrides: Partial<ProviderPermitObservation> = {},
) {
  return ProviderPermitObservationSchema.parse({
    canonicalPropertyId: SOURCE_PROPERTY_ID,
    publicSnapshotId: SOURCE_SNAPSHOT,
    provider: "permitstack",
    providerRecordId: "SYN-PROVIDER-RECORD",
    permitNumber: "SYN-PERMIT-1",
    category: "ROOFING",
    categoryBasis: "provider_classification",
    jurisdiction: "Troy",
    sourceStatusKind: "provider_normalized",
    providerStatus: "ISSUED",
    nativeStatus: null,
    supportedLifecycle: "unknown",
    statusBasis: "provider_issued_only",
    activityClaim: "not_established",
    dateFiled: null,
    dateIssued: "2016-10-28",
    dateCompleted: null,
    dateExpired: null,
    ageSinceIssueDays: 3652,
    issuedMoreThanFiveYearsAgo: true,
    currentlyReportedActiveIssuedMoreThanFiveYearsAgo: false,
    ageBasis: "age_since_issue",
    openedAt: null,
    continuousOpenDays: null,
    continuousOpenIntervalBasis: "not_established",
    reportedBusinessName: PRIVATE_PARTY_CANARY,
    reportedBusinessRole: "provider_reported_party_unverified",
    contractorLicenseIdentifier: PRIVATE_LICENSE_CANARY,
    verifiedContractorIdentity: false,
    sourceObservedAt: stamp,
    assessmentAt: stamp,
    sourceDataThrough: "2026-10-27",
    sourceLastRefreshed: "2026-10-28",
    rightsTier: "protected",
    provenance: {
      sourceId: "synthetic-provider-source",
      responseSha256: hash,
      recordDigest: hash,
      termsSha256: hash,
      metadataSha256: hash,
      statusDefinitionSha256: hash,
      canonicalJoinReceiptSha256: hash,
      nativeStatusReceiptSha256: null,
    },
    limitations: [
      "Synthetic source observation; no uninterrupted open history or verified contractor role.",
    ],
    ...overrides,
  });
}
export function deedObservation() {
  return RecordedTransferIndexObservationSchema.parse({
    canonicalPropertyId: SOURCE_PROPERTY_ID,
    queriedPinSha256: hash,
    sourceSystem: "oakland_county_super_index",
    sourceIndexAdvertisedStart: "1964-01-01",
    queryDateFilters: { from: null, through: null },
    claimWindowStart: "2016-10-18",
    observedThrough: "2026-10-19",
    sourceIndexedThrough: "2026-10-20",
    sourceVerifiedThrough: "2026-10-19",
    lastRecordedDeedDate: "2012-01-01",
    deedDocumentCount: 3,
    allResultPagesObserved: true,
    exactCurrentPinMatched: true,
    otherSearchFiltersEmpty: true,
    priorParcelLineageReviewed: false,
    claimKind: "recorded_deed_index_observation",
    noDeedObservedForMoreThanTenYears: true,
    ownershipContinuity: "not_established",
    confidence: "bounded_current_pin_index_observation",
    witnessTiming: "retrospectively_qualified",
    reference: {
      sourceId: "synthetic-deed-index",
      sourceUrl: "https://www.ocmideeds.com/MIOakland/MVPSearch.WebSite/",
      recordSha256: hash,
      observedAt: stamp,
      rightsTier: "protected",
    },
    rightsTier: "protected",
    limitations: [
      "Synthetic current-PIN window; no reviewed predecessor lineage or legal ownership continuity.",
    ],
  });
}
export function sourceProperty() {
  return PropertySchema.parse({
    ...nonemptyEvidenceProperty,
    id: SOURCE_PROPERTY_ID,
    nativeId: SOURCE_PROPERTY_ID,
    permits: [
      {
        id: "SYN-PERMIT-1",
        status: "unknown",
        statusBasis: "issued_only",
        kind: "roof_unspecified",
        openedAt: null,
        closedAt: null,
        contractor: {
          reportedName: null,
          verifiedCompanyId: null,
          license: null,
          rating: null,
        },
        provenance: [],
        sourceObservations: [providerObservation()],
      },
    ],
    ownership: {
      ...nonemptyEvidenceProperty.ownership,
      recordedTransferIndexObservations: [deedObservation()],
    },
  });
}
