/**
 * Filters radius-search parcels for the aging-roof (structure-year proxy) layer.
 *
 * Missing `builtYear` is excluded when the layer is on — never treated as old.
 * When the whole table lacks years, the layer stays visible but does not hide rows.
 */
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Arguments for selecting candidates that match the aging-roof layer toggle.
 */
export interface SelectSearchInRadiusCandidatesForAgingRoofLayerArguments {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  agingRoofLayerEnabled: boolean;
  minStructureAgeYears: number;
  currentUtcYear: number;
  /** When true, show all rows even if the aging layer is on (no year signal). */
  structureYearUnavailableOnTable?: boolean;
}

/**
 * Returns all candidates when the layer is off or years are unpublished on the
 * table; otherwise parcels old enough by structure year. Null `builtYear` never
 * qualifies when some years exist on the table.
 */
export function selectSearchInRadiusCandidatesForAgingRoofLayer(
  arguments_: SelectSearchInRadiusCandidatesForAgingRoofLayerArguments,
): SearchInRadiusCandidate[] {
  if (
    !arguments_.agingRoofLayerEnabled ||
    arguments_.structureYearUnavailableOnTable === true
  ) {
    return arguments_.searchInRadiusCandidates;
  }

  return arguments_.searchInRadiusCandidates.filter((candidate) => {
    if (candidate.builtYear === null) {
      return false;
    }
    return (
      arguments_.currentUtcYear - candidate.builtYear >= arguments_.minStructureAgeYears
    );
  });
}
