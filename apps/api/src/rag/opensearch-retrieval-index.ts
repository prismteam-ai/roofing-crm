/**
 * OpenSearch-backed hybrid retrieval index with geo filters and kNN.
 */
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";

import {
  CHESTER_DEMO_RAG_READ_ALIAS,
  CHESTER_DEMO_RAG_RETRIEVAL_MODE,
} from "./chester-demo-rag-contract.js";
import {
  BEDROCK_EMBEDDING_DIMENSIONS,
  hashEmbeddingFromText,
} from "./embedding-hash.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import type {
  RetrievedRoofingOpportunityChunk,
  RetrievalIndex,
  RoofingOpportunityRetrievalFilters,
  RoofingOpportunityIndexedDocument,
} from "./retrieval-interfaces.js";

export const DEFAULT_RAG_INDEX_NAME =
  process.env.RAG_INDEX_NAME ?? "roofing-opportunity-chunks";

export const RAG_BULK_BATCH_MAX_DOCUMENTS = 500;
export const RAG_BULK_BATCH_MAX_BYTES = 5 * 1024 * 1024;

const RRF_RANK_CONSTANT = 60;

function isLocalOpenSearchEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith("http://127.0.0.1") || endpoint.startsWith("http://localhost")
  );
}

export function isBm25StructuredRetrievalMode(): boolean {
  return (
    process.env.RAG_RETRIEVAL_MODE === CHESTER_DEMO_RAG_RETRIEVAL_MODE ||
    process.env.RAG_RETRIEVAL_MODE === "bm25_structured_v1"
  );
}

/**
 * Resolves the SigV4 signing service for a hosted OpenSearch endpoint.
 */
export function resolveOpenSearchSigningService(endpoint: string): "aoss" | "es" {
  return endpoint.includes(".aoss.amazonaws.com") ? "aoss" : "es";
}

/**
 * Creates an OpenSearch client from environment.
 */
export function createOpenSearchClient(): Client {
  const node = process.env.OPENSEARCH_ENDPOINT ?? "http://127.0.0.1:9200";
  if (isLocalOpenSearchEndpoint(node)) {
    return new Client({ node });
  }

  return new Client({
    ...AwsSigv4Signer({
      region: process.env.AWS_REGION ?? "us-east-2",
      service: resolveOpenSearchSigningService(node),
      getCredentials: () => defaultProvider()(),
    }),
    node,
  });
}

/**
 * Builds OpenSearch bool filter clauses shared by BM25 and kNN queries.
 */
export function buildFilterClauses(
  filters: RoofingOpportunityRetrievalFilters,
): Record<string, unknown>[] {
  const clauses: Record<string, unknown>[] = [{ term: { county: filters.county } }];

  if (filters.provenance !== undefined) {
    clauses.push({ term: { provenance: filters.provenance } });
  }
  if (filters.schemaVersion !== undefined) {
    clauses.push({ term: { schema_version: filters.schemaVersion } });
  }
  if (filters.documentKind !== undefined) {
    clauses.push({ term: { documentKind: filters.documentKind } });
  }
  if (filters.hasOpenRoofingPermit === true) {
    clauses.push({ term: { has_open_roofing_permit: true } });
  }
  if (filters.minOpenPermitYears !== undefined) {
    clauses.push({
      range: { open_permit_years: { gte: filters.minOpenPermitYears } },
    });
  }
  if (filters.minBuiltYear !== undefined) {
    clauses.push({
      range: { built_year: { lte: filters.minBuiltYear } },
    });
  }
  if (filters.maxBuiltYear !== undefined) {
    clauses.push({
      range: { built_year: { lt: filters.maxBuiltYear } },
    });
  }
  if (filters.center !== undefined && filters.radiusMiles !== undefined) {
    clauses.push({
      geo_distance: {
        distance: `${String(filters.radiusMiles)}mi`,
        location: {
          lat: filters.center.lat,
          lon: filters.center.lng,
        },
      },
    });
  }
  if (filters.allowedPropertyIds !== undefined) {
    clauses.push({
      terms: { propertyId: [...filters.allowedPropertyIds] },
    });
  }

  return clauses;
}

/**
 * Deterministic reciprocal-rank fusion for BM25 and vector candidate lists.
 */
export function fuseRetrievalResultsWithRrf(
  rankedLists: RetrievedRoofingOpportunityChunk[][],
  limit: number,
): RetrievedRoofingOpportunityChunk[] {
  const fusedScores = new Map<
    string,
    { chunk: RoofingOpportunityChunk; score: number }
  >();

  for (const rankedList of rankedLists) {
    rankedList.forEach((entry, rankIndex) => {
      const contribution = 1 / (RRF_RANK_CONSTANT + rankIndex + 1);
      const existing = fusedScores.get(entry.chunk.chunkId);
      if (existing === undefined) {
        fusedScores.set(entry.chunk.chunkId, {
          chunk: entry.chunk,
          score: contribution,
        });
        return;
      }
      existing.score += contribution;
    });
  }

  return [...fusedScores.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => ({ chunk: entry.chunk, score: entry.score }));
}

function mapSearchHit(hit: {
  _score?: number;
  _source?: RoofingOpportunityChunk;
}): RetrievedRoofingOpportunityChunk | null {
  if (hit._source === undefined) {
    return null;
  }
  return {
    chunk: hit._source,
    score: hit._score ?? 0,
  };
}

function toOpenSearchDocument(chunk: RoofingOpportunityChunk): Record<string, unknown> {
  return {
    ...chunk,
    location: {
      lat: chunk.latitude,
      lon: chunk.longitude,
    },
  };
}

export async function bulkUpsertChunksBatched(
  client: Client,
  indexName: string,
  chunks: RoofingOpportunityChunk[],
  options?: {
    refresh?: boolean | "wait_for";
    maxDocuments?: number;
    maxBytes?: number;
  },
): Promise<void> {
  const maxDocuments = options?.maxDocuments ?? RAG_BULK_BATCH_MAX_DOCUMENTS;
  const maxBytes = options?.maxBytes ?? RAG_BULK_BATCH_MAX_BYTES;
  let batch: RoofingOpportunityChunk[] = [];
  let batchBytes = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) {
      return;
    }
    const body = batch.flatMap((chunk) => [
      { index: { _index: indexName, _id: chunk.chunkId } },
      toOpenSearchDocument(chunk),
    ]);
    const response = await client.bulk({
      refresh: false,
      body,
    });
    if (response.body.errors === true) {
      const firstError = response.body.items?.find(
        (item: { index?: { error?: unknown } }) => item.index?.error !== undefined,
      );
      throw new Error(
        `OpenSearch bulk upsert failed: ${JSON.stringify(firstError?.index?.error ?? "unknown")}`,
      );
    }
    batch = [];
    batchBytes = 0;
  };

  for (const chunk of chunks) {
    const serialized = JSON.stringify(toOpenSearchDocument(chunk));
    const nextBytes = batchBytes + serialized.length;
    if (batch.length >= maxDocuments || nextBytes > maxBytes) {
      await flush();
    }
    batch.push(chunk);
    batchBytes += serialized.length;
  }
  await flush();

  if (options?.refresh !== undefined) {
    await client.indices.refresh({
      index: indexName,
      ...(options.refresh === "wait_for" ? { wait_for: true } : {}),
    });
  }
}

export async function swapReadAlias(
  client: Client,
  aliasName: string,
  newIndexName: string,
): Promise<string | null> {
  let previousIndexName: string | null = null;
  try {
    const aliasResponse = await client.indices.getAlias({ name: aliasName });
    const existing = Object.keys(aliasResponse.body);
    if (existing.length === 1) {
      previousIndexName = existing[0] ?? null;
    }
  } catch {
    previousIndexName = null;
  }

  const actions: Array<Record<string, Record<string, string>>> = [];
  if (previousIndexName !== null) {
    actions.push({ remove: { index: previousIndexName, alias: aliasName } });
  }
  actions.push({ add: { index: newIndexName, alias: aliasName } });
  await client.indices.updateAliases({ body: { actions } });
  return previousIndexName;
}

/**
 * Creates a retrieval index backed by OpenSearch hybrid BM25 + kNN.
 */
export function createOpenSearchRetrievalIndex(
  client: Client,
  indexName: string = DEFAULT_RAG_INDEX_NAME,
): RetrievalIndex {
  return {
    async upsertChunks(chunks: RoofingOpportunityIndexedDocument[]): Promise<void> {
      await bulkUpsertChunksBatched(
        client,
        indexName,
        chunks.map((chunk) => {
          const { embedding: _embedding, ...rest } = chunk;
          return rest;
        }),
        { refresh: true },
      );
    },

    async isIndexed(): Promise<boolean> {
      try {
        const exists = await client.indices.exists({ index: indexName });
        if (exists.body !== true) {
          return false;
        }
        const countResponse = await client.count({ index: indexName });
        const documentCount =
          typeof countResponse.body.count === "number" ? countResponse.body.count : 0;
        return documentCount > 0;
      } catch {
        return false;
      }
    },

    async hybridSearch(arguments_: {
      query: string;
      queryEmbedding: number[];
      filters: RoofingOpportunityRetrievalFilters;
      limit: number;
    }): Promise<RetrievedRoofingOpportunityChunk[]> {
      const filterClauses = buildFilterClauses(arguments_.filters);
      const filterBool = filterClauses.length > 0 ? { filter: filterClauses } : {};

      const lexicalResponse = await client.search({
        index: indexName,
        body: {
          size: arguments_.limit,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: arguments_.query,
                    fields: [
                      "text",
                      "propertyId",
                      "documentKind",
                      "address_street",
                      "permit_id",
                      "contractor_name",
                    ],
                  },
                },
              ],
              ...filterBool,
            },
          },
        },
      });

      const lexicalHits = (lexicalResponse.body.hits?.hits ?? []) as Array<{
        _score?: number;
        _source?: RoofingOpportunityChunk;
      }>;

      const lexicalResults = lexicalHits
        .map(mapSearchHit)
        .filter((entry): entry is RetrievedRoofingOpportunityChunk => entry !== null);

      if (isBm25StructuredRetrievalMode()) {
        return lexicalResults.slice(0, arguments_.limit);
      }

      let vectorHits: Array<{
        _score?: number;
        _source?: RoofingOpportunityChunk;
      }> = [];

      if (arguments_.queryEmbedding.length > 0) {
        try {
          const vectorResponse = await client.search({
            index: indexName,
            body: {
              size: arguments_.limit,
              query: {
                bool: {
                  must: [
                    {
                      knn: {
                        embedding: {
                          vector: arguments_.queryEmbedding,
                          k: arguments_.limit,
                        },
                      },
                    },
                  ],
                  ...filterBool,
                },
              },
            },
          });
          vectorHits = (vectorResponse.body.hits?.hits ?? []) as Array<{
            _score?: number;
            _source?: RoofingOpportunityChunk;
          }>;
        } catch {
          vectorHits = [];
        }
      }

      const vectorResults = vectorHits
        .map(mapSearchHit)
        .filter((entry): entry is RetrievedRoofingOpportunityChunk => entry !== null);

      if (vectorResults.length === 0) {
        return lexicalResults.slice(0, arguments_.limit);
      }

      return fuseRetrievalResultsWithRrf(
        [lexicalResults, vectorResults],
        arguments_.limit,
      );
    },
  };
}

function bm25IndexMappings(): Record<string, unknown> {
  return {
    properties: {
      chunkId: { type: "keyword" },
      propertyId: { type: "keyword" },
      parcel_identifier: { type: "keyword" },
      county: { type: "keyword" },
      documentKind: { type: "keyword" },
      text: { type: "text" },
      sourceUri: { type: "keyword" },
      built_year: { type: "integer" },
      has_open_roofing_permit: { type: "boolean" },
      open_permit_years: { type: "integer" },
      latitude: { type: "float" },
      longitude: { type: "float" },
      location: { type: "geo_point" },
      address_street: { type: "text" },
      address_city: { type: "keyword" },
      contractor_name: { type: "keyword" },
      bbb_rating: { type: "keyword" },
      provenance: { type: "keyword" },
      schema_version: { type: "integer" },
      permit_id: { type: "keyword" },
    },
  };
}

function hybridIndexMappings(): Record<string, unknown> {
  return {
    properties: {
      ...(bm25IndexMappings().properties as Record<string, unknown>),
      embedding: {
        type: "knn_vector",
        dimension: BEDROCK_EMBEDDING_DIMENSIONS,
        method: {
          name: "hnsw",
          space_type: "cosinesimil",
          engine: "faiss",
        },
      },
    },
  };
}

/**
 * Ensures the OpenSearch index exists with hybrid vector + geo mapping.
 */
export async function ensureOpenSearchIndex(
  client: Client,
  indexName: string = DEFAULT_RAG_INDEX_NAME,
): Promise<void> {
  const exists = await client.indices.exists({ index: indexName });
  if (exists.body === true) {
    return;
  }

  await client.indices.create({
    index: indexName,
    body: {
      settings: {
        index: {
          knn: !isBm25StructuredRetrievalMode(),
          number_of_replicas: isBm25StructuredRetrievalMode() ? 0 : undefined,
        },
      },
      mappings: isBm25StructuredRetrievalMode()
        ? bm25IndexMappings()
        : hybridIndexMappings(),
    },
  });
}

export async function resolveChesterDemoReadIndexName(client: Client): Promise<string> {
  try {
    const aliasResponse = await client.indices.getAlias({
      name: CHESTER_DEMO_RAG_READ_ALIAS,
    });
    const indexNames = Object.keys(aliasResponse.body);
    if (indexNames.length === 1) {
      return indexNames[0] as string;
    }
  } catch {
    // fall through to default index name
  }
  return process.env.RAG_INDEX_NAME ?? DEFAULT_RAG_INDEX_NAME;
}

/**
 * Embeds corpus chunks for indexing using the configured embedding service.
 */
export async function embedChunksForIndexing(
  chunks: RoofingOpportunityChunk[],
  embedText: (text: string) => Promise<number[]>,
): Promise<RoofingOpportunityIndexedDocument[]> {
  const embedded: RoofingOpportunityIndexedDocument[] = [];
  for (const chunk of chunks) {
    const embedding = await embedText(chunk.text);
    embedded.push({ ...chunk, embedding });
  }
  return embedded;
}

/**
 * Local/test helper when no Bedrock embeddings are configured at index time.
 */
export function embedChunksWithHash(
  chunks: RoofingOpportunityChunk[],
): RoofingOpportunityIndexedDocument[] {
  return chunks.map((chunk) => ({
    ...chunk,
    embedding: hashEmbeddingFromText(chunk.text),
  }));
}
