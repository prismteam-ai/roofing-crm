/**
 * Hybrid retrieval orchestration for roofing-opportunity chunks.
 */
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import { extractPropertyIdAliasFromQuestion } from "./normalize-roofing-agent-question.js";
import type {
  EmbeddingService,
  RetrievedRoofingOpportunityChunk,
  RetrievalIndex,
  RoofingOpportunityRetrievalFilters,
} from "./retrieval-interfaces.js";

export const DEFAULT_RETRIEVAL_LIMIT = 8;
export const MIN_RETRIEVAL_CONFIDENCE = 0.2;

/**
 * Arguments for hybrid chunk retrieval.
 */
export interface HybridRetrieveRoofingChunksArguments {
  question: string;
  filters: RoofingOpportunityRetrievalFilters;
  embeddingService: EmbeddingService;
  retrievalIndex: RetrievalIndex;
  limit?: number;
  chunksById?: Map<string, RoofingOpportunityChunk>;
}

/**
 * Runs hybrid retrieval with optional exact property-id alias boost.
 */
export async function hybridRetrieveRoofingChunks(
  arguments_: HybridRetrieveRoofingChunksArguments,
): Promise<RetrievedRoofingOpportunityChunk[]> {
  const limit = arguments_.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const queryEmbedding = await arguments_.embeddingService.embedText(
    arguments_.question,
  );

  const aliasPropertyId = extractPropertyIdAliasFromQuestion(arguments_.question);
  if (aliasPropertyId !== null && arguments_.chunksById !== undefined) {
    const aliasChunks = [...arguments_.chunksById.values()].filter(
      (chunk) =>
        chunk.propertyId === aliasPropertyId &&
        chunk.county === arguments_.filters.county,
    );
    if (aliasChunks.length > 0) {
      return aliasChunks.map((chunk) => ({ chunk, score: 1 }));
    }
  }

  return arguments_.retrievalIndex.hybridSearch({
    query: arguments_.question,
    queryEmbedding,
    filters: arguments_.filters,
    limit,
  });
}

/**
 * Computes a confidence score from top retrieval hits.
 */
export function resolveRetrievalConfidence(
  retrievedChunks: RetrievedRoofingOpportunityChunk[],
): number {
  if (retrievedChunks.length === 0) {
    return 0;
  }
  const topScore = retrievedChunks[0]?.score ?? 0;
  return Math.min(1, Math.max(0, topScore));
}

/**
 * Whether retrieval confidence is high enough to answer without fallback.
 */
export function isRetrievalConfidenceSufficient(confidence: number): boolean {
  return confidence >= MIN_RETRIEVAL_CONFIDENCE;
}
