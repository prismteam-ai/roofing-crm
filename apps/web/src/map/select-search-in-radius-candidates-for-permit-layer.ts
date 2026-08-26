/**
 * Filters and sorts radius-search candidates for the long-open permit layer.
 */
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import {
  DEFAULT_MIN_OPEN_PERMIT_YEARS,
  formatLongOpenPermitListChipLabel,
  resolveMaxLongOpenRoofingPermitYears,
} from "./property-permit-layer-summary";
import type { PropertyPermitDetail } from "./PropertyPermitLayerPanel";

/**
 * Arguments for permit-layer candidate selection.
 */
export interface SelectSearchInRadiusCandidatesForPermitLayerArguments {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  propertyPermitLayerEnabled: boolean;
  permitDetailsByPropertyId: Record<string, PropertyPermitDetail[]>;
  minOpenPermitYears?: number;
  currentUtcYear?: number;
}

/**
 * Returns all candidates when the permit layer is off; otherwise only streets
 * with a long-open roofing permit, sorted by open duration then structure year.
 */
export function selectSearchInRadiusCandidatesForPermitLayer(
  arguments_: SelectSearchInRadiusCandidatesForPermitLayerArguments,
): SearchInRadiusCandidate[] {
  if (!arguments_.propertyPermitLayerEnabled) {
    return arguments_.searchInRadiusCandidates;
  }

  const minOpenPermitYears =
    arguments_.minOpenPermitYears ?? DEFAULT_MIN_OPEN_PERMIT_YEARS;
  const currentUtcYear = arguments_.currentUtcYear ?? new Date().getUTCFullYear();

  const qualifyingCandidates = arguments_.searchInRadiusCandidates.filter(
    (candidate) => {
      const permitDetails =
        arguments_.permitDetailsByPropertyId[candidate.propertyId] ?? [];
      return (
        resolveMaxLongOpenRoofingPermitYears({
          permitDetails,
          minOpenPermitYears,
          currentUtcYear,
        }) !== null
      );
    },
  );

  return [...qualifyingCandidates].sort((leftCandidate, rightCandidate) => {
    const leftOpenYears =
      resolveMaxLongOpenRoofingPermitYears({
        permitDetails:
          arguments_.permitDetailsByPropertyId[leftCandidate.propertyId] ?? [],
        minOpenPermitYears,
        currentUtcYear,
      }) ?? -1;
    const rightOpenYears =
      resolveMaxLongOpenRoofingPermitYears({
        permitDetails:
          arguments_.permitDetailsByPropertyId[rightCandidate.propertyId] ?? [],
        minOpenPermitYears,
        currentUtcYear,
      }) ?? -1;

    if (rightOpenYears !== leftOpenYears) {
      return rightOpenYears - leftOpenYears;
    }

    const leftBuiltYear = leftCandidate.builtYear ?? Number.MAX_SAFE_INTEGER;
    const rightBuiltYear = rightCandidate.builtYear ?? Number.MAX_SAFE_INTEGER;
    return leftBuiltYear - rightBuiltYear;
  });
}

/**
 * Builds list-row chip labels for candidates with known long-open permits.
 */
export function resolveLongOpenPermitListChipLabelsByPropertyId(arguments_: {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  permitDetailsByPropertyId: Record<string, PropertyPermitDetail[]>;
  minOpenPermitYears?: number;
  currentUtcYear?: number;
}): Record<string, string> {
  const minOpenPermitYears =
    arguments_.minOpenPermitYears ?? DEFAULT_MIN_OPEN_PERMIT_YEARS;
  const currentUtcYear = arguments_.currentUtcYear ?? new Date().getUTCFullYear();
  const labels: Record<string, string> = {};

  for (const candidate of arguments_.searchInRadiusCandidates) {
    const openYears = resolveMaxLongOpenRoofingPermitYears({
      permitDetails: arguments_.permitDetailsByPropertyId[candidate.propertyId] ?? [],
      minOpenPermitYears,
      currentUtcYear,
    });
    if (openYears !== null) {
      labels[candidate.propertyId] = formatLongOpenPermitListChipLabel(openYears);
    }
  }

  return labels;
}
