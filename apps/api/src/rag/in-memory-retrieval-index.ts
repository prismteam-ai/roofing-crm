/**
 * In-memory hybrid retrieval index for tests and offline agent paths.
 */
import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";

import { hashEmbeddingFromText } from "./embedding-hash.js";
import { fuseRetrievalResultsWithRrf } from "./opensearch-retrieval-index.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import type {
  RetrievedRoofingOpportunityChunk,
  RetrievalIndex,
  RoofingOpportunityRetrievalFilters,
  RoofingOpportunityIndexedDocument,
} from "./retrieval-interfaces.js";

function keywordScore(query: string, text: string): number {
  const queryTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2);
  if (queryTokens.length === 0) {
    return 0;
  }
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return hits / queryTokens.length;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function passesFilters(
  chunk: RoofingOpportunityChunk,
  filters: RoofingOpportunityRetrievalFilters,
): boolean {
  if (chunk.county !== filters.county) {
    return false;
  }
  if (filters.provenance !== undefined && chunk.provenance !== filters.provenance) {
    return false;
  }
  if (
    filters.schemaVersion !== undefined &&
    (chunk.schema_version ?? 1) !== filters.schemaVersion
  ) {
    return false;
  }
  if (
    filters.documentKind !== undefined &&
    chunk.documentKind !== filters.documentKind
  ) {
    return false;
  }
  if (
    filters.allowedPropertyIds !== undefined &&
    !filters.allowedPropertyIds.has(chunk.propertyId)
  ) {
    return false;
  }
  if (
    filters.minBuiltYear !== undefined &&
    (chunk.built_year === null || chunk.built_year > filters.minBuiltYear)
  ) {
    return false;
  }
  if (
    filters.maxBuiltYear !== undefined &&
    (chunk.built_year === null || chunk.built_year >= filters.maxBuiltYear)
  ) {
    return false;
  }
  if (filters.hasOpenRoofingPermit === true && !chunk.has_open_roofing_permit) {
    return false;
  }
  if (
    filters.minOpenPermitYears !== undefined &&
    (chunk.open_permit_years === null ||
      chunk.open_permit_years < filters.minOpenPermitYears)
  ) {
    return false;
  }
  if (filters.center !== undefined && filters.radiusMiles !== undefined) {
    const distanceMiles = haversineDistanceMiles(
      filters.center.lat,
      filters.center.lng,
      chunk.latitude,
      chunk.longitude,
    );
    if (distanceMiles > filters.radiusMiles) {
      return false;
    }
  }
  return true;
}

/**
 * Creates an in-memory retrieval index for Vitest and local dev without Docker.
 */
export function createInMemoryRetrievalIndex(): RetrievalIndex {
  const chunksById = new Map<string, RoofingOpportunityChunk>();
  const embeddingsByChunkId = new Map<string, number[]>();

  return {
    async upsertChunks(chunks: RoofingOpportunityIndexedDocument[]): Promise<void> {
      for (const chunk of chunks) {
        chunksById.set(chunk.chunkId, chunk);
        embeddingsByChunkId.set(chunk.chunkId, chunk.embedding);
      }
    },

    async isIndexed(): Promise<boolean> {
      return chunksById.size > 0;
    },

    async hybridSearch(arguments_: {
      query: string;
      queryEmbedding: number[];
      filters: RoofingOpportunityRetrievalFilters;
      limit: number;
    }): Promise<RetrievedRoofingOpportunityChunk[]> {
      const lexicalResults: RetrievedRoofingOpportunityChunk[] = [];
      const vectorResults: RetrievedRoofingOpportunityChunk[] = [];

      for (const chunk of chunksById.values()) {
        if (!passesFilters(chunk, arguments_.filters)) {
          continue;
        }
        const bm25Proxy = keywordScore(arguments_.query, chunk.text);
        if (bm25Proxy > 0) {
          lexicalResults.push({ chunk, score: bm25Proxy });
        }
        const storedEmbedding =
          embeddingsByChunkId.get(chunk.chunkId) ?? hashEmbeddingFromText(chunk.text);
        const vectorScore = cosineSimilarity(
          arguments_.queryEmbedding,
          storedEmbedding,
        );
        if (vectorScore > 0) {
          vectorResults.push({ chunk, score: vectorScore });
        }
      }

      lexicalResults.sort((left, right) => right.score - left.score);
      vectorResults.sort((left, right) => right.score - left.score);

      return fuseRetrievalResultsWithRrf(
        [lexicalResults, vectorResults],
        arguments_.limit,
      );
    },
  };
}

export { hashEmbeddingFromText };
