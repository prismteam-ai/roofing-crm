/**
 * Clips radius-search parcels to a true circle around the search pin.
 *
 * Recalculates `distanceMiles` from the current center so pin/radius/GPS
 * changes update the list without a live API.
 */
import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";

import type { SearchMapCenter } from "./search-map-center";
import type { SearchInRadiusCandidate } from "./SearchInRadiusCandidateList";

/**
 * Arguments for pin-radius clipping of search candidates.
 */
export interface SelectSearchInRadiusCandidatesForPinRadiusArguments {
  searchInRadiusCandidates: SearchInRadiusCandidate[];
  searchMapCenter: SearchMapCenter;
  searchRadiusMiles: number;
}

/**
 * Returns parcels inside `searchRadiusMiles` of the pin, nearest first.
 */
export function selectSearchInRadiusCandidatesForPinRadius(
  arguments_: SelectSearchInRadiusCandidatesForPinRadiusArguments,
): SearchInRadiusCandidate[] {
  const insideRadius: SearchInRadiusCandidate[] = [];

  for (const candidate of arguments_.searchInRadiusCandidates) {
    const distanceMiles = haversineDistanceMiles(
      arguments_.searchMapCenter.latitude,
      arguments_.searchMapCenter.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    if (distanceMiles > arguments_.searchRadiusMiles) {
      continue;
    }
    insideRadius.push({ ...candidate, distanceMiles });
  }

  insideRadius.sort(
    (candidateA, candidateB) => candidateA.distanceMiles - candidateB.distanceMiles,
  );
  return insideRadius;
}
