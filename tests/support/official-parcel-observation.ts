import { OfficialParcelObservationSchema } from "../../packages/contracts/src/index";

export const officialParcelObservation = OfficialParcelObservationSchema.parse({
  canonicalPropertyId: "synthetic-property",
  sourceId: "official-oakland-tax-parcel-full-attributes",
  sourceUrl:
    "https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1",
  nativeId: "123",
  pin: "SYNTHETIC-PIN",
  name1: null,
  name2: null,
  postalAddressAsObserved: "SYNTHETIC MAILING STRING  MI  00000",
  fieldAvailability: {
    NAME1: "not_observed_in_retained_record",
    NAME2: "observed_null_or_empty",
    POSTALADDRESS: "observed_value",
  },
  observedAt: "2026-10-27T08:00:00Z",
  recordSha256: "a".repeat(64),
  sourceMetadataSha256: "b".repeat(64),
  termsSha256: "c".repeat(64),
  sourceProfileSha256: "d".repeat(64),
  classification: "official_public",
  ownerLocation: {
    ownerRegion: "regional",
    locationClass: "in_state",
    siteAddressMatch: false,
    evidenceClass: "derived_deterministically",
    basis: "observed_postal_state_and_exact_site_tokens",
    derivationVersion: "postal-state-v2-exact-tokens",
    sourceRecordSha256: "a".repeat(64),
  },
  limitations: ["Synthetic test observation; no legal ownership inferred."],
});
