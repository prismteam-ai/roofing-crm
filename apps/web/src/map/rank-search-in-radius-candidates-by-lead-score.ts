/**
 * Ranks radius-search candidates by the shared composite lead score.
 *
 * Same `scoreLead` the API stamps on `leads.create`, so the order a rep sees
 * on the map matches the score stored on the converted lead. Score ties keep
 * nearest-first order — an all-zero list stays sorted by distance.
 */
import { scoreLead } from "@roofing-crm-challenge/shared";

import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";
import { resolveMaxLongOpenRoofingPermitYears } from "./property-permit-layer-summary";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Computes the composite lead score for one candidate row.
 *
 * Synthetic signals (chester-demo built year or synthetic permit rows) demote
 * the score exactly as the server-side stamp does.
 */
export function resolveSearchInRadiusCandidateLeadScore(arguments_: {
  candidate: SearchInRadiusCandidate;
  permitDetails: PropertyPermitDetail[];
  minStructureAgeYears: number;
  minOpenPermitYears: number;
  currentUtcYear: number;
}): number {
  const structureAgeYears =
    arguments_.candidate.builtYear === null
      ? null
      : arguments_.currentUtcYear - arguments_.candidate.builtYear;
  const maxOpenPermitYears = resolveMaxLongOpenRoofingPermitYears({
    permitDetails: arguments_.permitDetails,
    minOpenPermitYears: arguments_.minOpenPermitYears,
    currentUtcYear: arguments_.currentUtcYear,
  });
  const hasSyntheticSignal =
    arguments_.candidate.builtYearSource === "synthetic_demo" ||
    arguments_.permitDetails.some(
      (permitDetail) => permitDetail.provenanceClass === "synthetic_demo",
    );

  return scoreLead({
    structureAgeYears,
    minStructureAgeYears: arguments_.minStructureAgeYears,
    maxOpenPermitYears,
    minOpenPermitYears: arguments_.minOpenPermitYears,
    hasSyntheticSignal,
  });
}

/**
 * Sorts candidates by lead score (highest first), then nearest-first.
 */
export function rankSearchInRadiusCandidatesByLeadScore(arguments_: {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  permitDetailsByPropertyId: Record<string, PropertyPermitDetail[]>;
  minStructureAgeYears: number;
  minOpenPermitYears: number;
  currentUtcYear?: number;
}): SearchInRadiusCandidate[] {
  const currentUtcYear = arguments_.currentUtcYear ?? new Date().getUTCFullYear();
  const leadScoreByPropertyId = new Map<string, number>();
  for (const candidate of arguments_.searchInRadiusCandidates) {
    leadScoreByPropertyId.set(
      candidate.propertyId,
      resolveSearchInRadiusCandidateLeadScore({
        candidate,
        permitDetails: arguments_.permitDetailsByPropertyId[candidate.propertyId] ?? [],
        minStructureAgeYears: arguments_.minStructureAgeYears,
        minOpenPermitYears: arguments_.minOpenPermitYears,
        currentUtcYear,
      }),
    );
  }

  return [...arguments_.searchInRadiusCandidates].sort(
    (leftCandidate, rightCandidate) => {
      const leftLeadScore = leadScoreByPropertyId.get(leftCandidate.propertyId) ?? 0;
      const rightLeadScore = leadScoreByPropertyId.get(rightCandidate.propertyId) ?? 0;
      if (rightLeadScore !== leftLeadScore) {
        return rightLeadScore - leftLeadScore;
      }
      return leftCandidate.distanceMiles - rightCandidate.distanceMiles;
    },
  );
}
