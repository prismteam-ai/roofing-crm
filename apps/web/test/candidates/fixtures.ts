// Shared fixtures for the Candidate list and Field triage tests: rows shaped exactly like the
// `search.properties` / `search.permits` responses (CrmProperty / CrmPermit plus provenance).
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import {
  buildCandidates,
  leadsByRequestIdentifier,
  type CandidateFilters,
  type CandidateLead,
} from "../../src/routes/Map/Candidates/candidates";

const CID = (n: number): string => `bafkrei${String(n).padStart(8, "a")}`.padEnd(59, "a");

export function property(
  n: number,
  over: Partial<Provenanced<CrmProperty>> = {},
): Provenanced<CrmProperty> {
  return {
    propertyCid: CID(n),
    requestIdentifier: `020188512${String(n)}`,
    latitude: 30.4 + n / 100,
    longitude: -97.6,
    coordinateSource: "gis_centroid",
    propertyType: "Building",
    propertyUsageType: "Residential",
    roofAgeYears: 15 + n,
    roofAgeBasis: "permit",
    roofAgeConfidence: "high",
    isLongTenure: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: "bafkreimanifest",
    missingReasons: [],
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreitablecid",
    runId: "run-3",
    ...over,
  } as Provenanced<CrmProperty>;
}

export function permit(
  propertyN: number,
  over: Partial<Provenanced<CrmPermit>> = {},
): Provenanced<CrmPermit> {
  return {
    propertyCid: CID(propertyN),
    permitCid: CID(100 + propertyN),
    jurisdiction: null,
    permitNumber: `P-${String(propertyN)}`,
    improvementType: "Roofing",
    improvementAction: "Replace",
    improvementStatus: null,
    statusClass: "stalled",
    issueDate: "2020-01-01",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 2300,
    contractorResolution: "unresolved",
    contractorCompanyCid: null,
    sourceManifestCid: "bafkreimanifest",
    missingReasons: [],
    capturedAt: "2026-10-20T00:00:00Z",
    cid: "bafkreitablecid",
    runId: "run-3",
    ...over,
  } as Provenanced<CrmPermit>;
}

export const FILTERS: CandidateFilters = {
  center: { lat: 30.4, lng: -97.62 },
  radiusMi: 5,
  roofAgeMinYears: 15,
};

export function candidates(
  props: Provenanced<CrmProperty>[],
  permits: Provenanced<CrmPermit>[] = [],
  leads: CandidateLead[] = [],
  filters: CandidateFilters = FILTERS,
) {
  return buildCandidates(props, permits, leadsByRequestIdentifier(leads), filters);
}

/** The value, or a test failure: replaces non-null assertions. */
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}
