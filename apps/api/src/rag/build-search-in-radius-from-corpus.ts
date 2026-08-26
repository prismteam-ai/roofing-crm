/**
 * Test helpers for roofing opportunity agent radius search mocks.
 */
import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";

import type { SearchInRadiusCandidate } from "../routers/search.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";

/**
 * Builds a deterministic search.inRadius mock from fixture corpus chunks.
 */
export function buildSearchInRadiusFromCorpus(
  chunks: RoofingOpportunityChunk[],
): (arguments_: {
  county: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  minStructureAgeYears?: number;
  limit?: number;
}) => Promise<SearchInRadiusCandidate[]> {
  return async (arguments_) => {
    const currentUtcYear = new Date().getUTCFullYear();
    const candidatesByPropertyId = new Map<string, SearchInRadiusCandidate>();

    for (const chunk of chunks) {
      if (chunk.county !== arguments_.county) {
        continue;
      }
      const distanceMiles = haversineDistanceMiles(
        arguments_.center.lat,
        arguments_.center.lng,
        chunk.latitude,
        chunk.longitude,
      );
      if (distanceMiles > arguments_.radiusMiles) {
        continue;
      }
      if (
        arguments_.minStructureAgeYears !== undefined &&
        chunk.built_year !== null &&
        currentUtcYear - chunk.built_year < arguments_.minStructureAgeYears
      ) {
        continue;
      }
      if (candidatesByPropertyId.has(chunk.propertyId)) {
        continue;
      }
      candidatesByPropertyId.set(chunk.propertyId, {
        propertyId: chunk.propertyId,
        parcelIdentifier: chunk.propertyId,
        latitude: chunk.latitude,
        longitude: chunk.longitude,
        builtYear: chunk.built_year,
        builtYearSource:
          chunk.provenance === "synthetic_demo" ? "synthetic_demo" : null,
        addressStreet: chunk.address_street ?? null,
        addressCity: chunk.address_city ?? null,
        gisMuni: null,
        distanceMiles,
        hasPermits: chunk.has_open_roofing_permit ?? null,
      });
    }

    const candidates = [...candidatesByPropertyId.values()].sort(
      (left, right) => left.distanceMiles - right.distanceMiles,
    );
    return arguments_.limit === undefined
      ? candidates
      : candidates.slice(0, arguments_.limit);
  };
}
