/**
 * Resolves published-property drawer detail for a selected search candidate.
 *
 * Prefers an injected `properties.get`-shaped detail when present; otherwise
 * builds a minimal detail from the list row so address_street still opens.
 * BBB stays hidden until a real contractor profile is supplied.
 */
import type { PublishedPropertyDrawerDetail } from "./PublishedPropertyDrawer";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Looks up or synthesizes drawer detail for `selectedPropertyId`.
 *
 * Returns null when nothing is selected or the id is not in the candidate set.
 */
export function resolvePublishedPropertyDrawerDetail(arguments_: {
  selectedPropertyId: string | null;
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  publishedPropertyDrawerDetailsByPropertyId?: Record<
    string,
    PublishedPropertyDrawerDetail
  >;
}): PublishedPropertyDrawerDetail | null {
  const {
    selectedPropertyId,
    searchInRadiusCandidates,
    publishedPropertyDrawerDetailsByPropertyId,
  } = arguments_;

  if (selectedPropertyId === null) {
    return null;
  }

  const injected = publishedPropertyDrawerDetailsByPropertyId?.[selectedPropertyId];
  if (injected !== undefined) {
    return injected;
  }

  const candidate = searchInRadiusCandidates.find(
    (row) => row.propertyId === selectedPropertyId,
  );
  if (candidate === undefined) {
    return null;
  }

  return {
    propertyId: candidate.propertyId,
    addressStreet: candidate.addressStreet,
    addressCity: candidate.addressCity,
    addressZip: null,
    builtYear: candidate.builtYear,
    builtYearSource: candidate.builtYearSource ?? null,
    hasBbbContractor: false,
    bbb: null,
  };
}
