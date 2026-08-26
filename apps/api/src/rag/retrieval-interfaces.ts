/**
 * Pure retrieval interfaces for the roofing-opportunity RAG plane.
 */
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";

/**
 * Metadata filters applied before hybrid search.
 */
export interface RoofingOpportunityRetrievalFilters {
  county: string;
  provenance?: string;
  schemaVersion?: number;
  documentKind?: "property_summary" | "roofing_permit";
  minBuiltYear?: number;
  maxBuiltYear?: number;
  hasOpenRoofingPermit?: boolean;
  minOpenPermitYears?: number;
  center?: { lat: number; lng: number };
  radiusMiles?: number;
  allowedPropertyIds?: ReadonlySet<string>;
}

/**
 * Chunk document stored in OpenSearch with a precomputed embedding vector.
 */
export type RoofingOpportunityIndexedDocument = RoofingOpportunityChunk & {
  embedding: number[];
};

/**
 * One retrieved chunk with a relevance score.
 */
export interface RetrievedRoofingOpportunityChunk {
  chunk: RoofingOpportunityChunk;
  score: number;
}

/**
 * Embeds text for k-NN leg of hybrid retrieval.
 */
export interface EmbeddingService {
  embedText(text: string): Promise<number[]>;
  embedTexts?(texts: string[]): Promise<number[][]>;
}

/**
 * Hybrid retrieval index over roofing-opportunity chunks.
 */
export interface RetrievalIndex {
  upsertChunks(chunks: RoofingOpportunityIndexedDocument[]): Promise<void>;
  hybridSearch(arguments_: {
    query: string;
    queryEmbedding: number[];
    filters: RoofingOpportunityRetrievalFilters;
    limit: number;
  }): Promise<RetrievedRoofingOpportunityChunk[]>;
  isIndexed(): Promise<boolean>;
}
