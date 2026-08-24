import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";

import type { AgentAskCitation } from "./create-http-agent-ask-api-client";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";
import type { SearchMapCenter } from "./search-map-center";

/**
 * Turns agent citations with map coordinates into radius-search marker rows.
 */
export function buildMapCandidatesFromAgentCitations(
  citations: AgentAskCitation[],
  searchMapCenter: SearchMapCenter | null,
): SearchInRadiusCandidate[] {
  const candidates: SearchInRadiusCandidate[] = [];

  for (const citation of citations) {
    if (citation.latitude === undefined || citation.longitude === undefined) {
      continue;
    }

    candidates.push({
      propertyId: citation.propertyId,
      parcelIdentifier: citation.parcelIdentifier ?? null,
      latitude: citation.latitude,
      longitude: citation.longitude,
      builtYear: citation.builtYear ?? null,
      addressStreet: citation.addressStreet ?? null,
      addressCity: citation.addressCity ?? null,
      gisMuni: null,
      distanceMiles:
        searchMapCenter === null
          ? 0
          : haversineDistanceMiles(
              searchMapCenter.latitude,
              searchMapCenter.longitude,
              citation.latitude,
              citation.longitude,
            ),
    });
  }

  return candidates;
}

/**
 * Appends citation-only markers without duplicating ids already on the map.
 */
export function mergeSearchInRadiusMapCandidates(
  baseCandidates: SearchInRadiusCandidate[],
  overlayCandidates: SearchInRadiusCandidate[],
): SearchInRadiusCandidate[] {
  if (overlayCandidates.length === 0) {
    return baseCandidates;
  }

  const seenPropertyIds = new Set(
    baseCandidates.map((candidate) => candidate.propertyId),
  );
  const mergedCandidates = [...baseCandidates];

  for (const candidate of overlayCandidates) {
    if (seenPropertyIds.has(candidate.propertyId)) {
      continue;
    }
    seenPropertyIds.add(candidate.propertyId);
    mergedCandidates.push(candidate);
  }

  return mergedCandidates;
}
