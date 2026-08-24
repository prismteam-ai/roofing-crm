/**
 * Detects when the published query table has no structure-year signal in radius.
 */
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Returns true when every candidate lacks `builtYear` (table has no year column data).
 */
export function isStructureYearUnavailableOnSearchCandidates(
  searchInRadiusCandidates: SearchInRadiusCandidate[],
): boolean {
  return (
    searchInRadiusCandidates.length > 0 &&
    searchInRadiusCandidates.every((candidate) => candidate.builtYear === null)
  );
}
