/**
 * Builds a retrieval index from environment or in-memory fixture fallback.
 */
import {
  createHashEmbeddingService,
  resolveEmbeddingService,
} from "./bedrock-embedding-service.js";
import { isChesterDemoRagReady } from "./chester-demo-rag-readiness.js";
import { createInMemoryRetrievalIndex } from "./in-memory-retrieval-index.js";
import { loadChesterDemoFixtureCorpus } from "./load-chester-demo-fixture-corpus.js";
import { buildChunksByIdMap, loadLeeFixtureCorpus } from "./load-lee-fixture-corpus.js";
import {
  createOpenSearchClient,
  createOpenSearchRetrievalIndex,
  embedChunksWithHash,
  resolveChesterDemoReadIndexName,
} from "./opensearch-retrieval-index.js";
import { CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY } from "./chester-demo-rag-contract.js";
import {
  loadRagCorpusManifestFromS3,
  type RagCorpusManifest,
} from "./rag-corpus-manifest.js";
import type { EmbeddingService, RetrievalIndex } from "./retrieval-interfaces.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";

export interface ResolvedRagRuntime {
  retrievalIndex: RetrievalIndex;
  embeddingService: EmbeddingService;
  chunksById: Map<string, RoofingOpportunityChunk>;
  resolveCorpusManifest: () => Promise<RagCorpusManifest | null>;
  resolveChesterDemoRagReady: (county: string) => Promise<boolean>;
}

let cachedRuntime: ResolvedRagRuntime | undefined;
let cachedManifest: RagCorpusManifest | null | undefined;

function isLambdaRuntimeWithoutOpenSearch(): boolean {
  return (
    process.env["AWS_LAMBDA_FUNCTION_NAME"] !== undefined &&
    process.env["AWS_LAMBDA_FUNCTION_NAME"].length > 0 &&
    process.env.OPENSEARCH_ENDPOINT === undefined
  );
}

function resolveEmbeddingServiceForRuntime(): EmbeddingService {
  try {
    return resolveEmbeddingService();
  } catch (error) {
    if (isLambdaRuntimeWithoutOpenSearch()) {
      return createHashEmbeddingService();
    }
    throw error;
  }
}

async function resolveCorpusManifest(): Promise<RagCorpusManifest | null> {
  if (cachedManifest !== undefined) {
    return cachedManifest;
  }
  const bucketName = process.env.RAG_CORPUS_BUCKET_NAME;
  if (bucketName === undefined || bucketName.length === 0) {
    cachedManifest = null;
    return cachedManifest;
  }
  cachedManifest =
    (await loadRagCorpusManifestFromS3({
      bucketName,
      objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
    })) ?? (await loadRagCorpusManifestFromS3({ bucketName }));
  return cachedManifest;
}

/**
 * Resolves retrieval runtime for agent.ask.
 */
export async function resolveRagRuntime(): Promise<ResolvedRagRuntime> {
  if (cachedRuntime !== undefined) {
    return cachedRuntime;
  }

  const embeddingService = resolveEmbeddingServiceForRuntime();
  const resolveChesterDemoRagReadyForCounty = async (county: string) => {
    const manifest = await resolveCorpusManifest();
    if (process.env.OPENSEARCH_ENDPOINT === undefined) {
      return isChesterDemoRagReady({ county, manifest });
    }
    const client = createOpenSearchClient();
    const indexName = await resolveChesterDemoReadIndexName(client);
    return isChesterDemoRagReady({
      county,
      manifest,
      client,
      indexName,
    });
  };

  if (process.env.OPENSEARCH_ENDPOINT !== undefined) {
    const client = createOpenSearchClient();
    const indexName = await resolveChesterDemoReadIndexName(client);
    const retrievalIndex = createOpenSearchRetrievalIndex(client, indexName);
    cachedRuntime = {
      retrievalIndex,
      embeddingService,
      chunksById: new Map(),
      resolveCorpusManifest,
      resolveChesterDemoRagReady: resolveChesterDemoRagReadyForCounty,
    };
    return cachedRuntime;
  }

  const isLambdaRuntime =
    process.env["AWS_LAMBDA_FUNCTION_NAME"] !== undefined &&
    process.env["AWS_LAMBDA_FUNCTION_NAME"].length > 0;
  if (isLambdaRuntime) {
    const retrievalIndex = createInMemoryRetrievalIndex();
    cachedRuntime = {
      retrievalIndex,
      embeddingService,
      chunksById: new Map(),
      resolveCorpusManifest,
      resolveChesterDemoRagReady: resolveChesterDemoRagReadyForCounty,
    };
    return cachedRuntime;
  }

  const leeChunks = await loadLeeFixtureCorpus();
  const chesterChunks = await loadChesterDemoFixtureCorpus();
  const chunks = [...leeChunks, ...chesterChunks];
  const chunksById = buildChunksByIdMap(chunks);
  const retrievalIndex = createInMemoryRetrievalIndex();
  await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));
  cachedRuntime = {
    retrievalIndex,
    embeddingService,
    chunksById,
    resolveCorpusManifest: async () => null,
    resolveChesterDemoRagReady: async (county) =>
      isChesterDemoRagReady({ county, manifest: null }) ||
      (county === "chester-demo" &&
        chunks.some((chunk) => chunk.county === "chester-demo")),
  };
  return cachedRuntime;
}

/**
 * Test helper to reset cached runtime between Vitest cases.
 */
export function resetRagRuntimeCacheForTests(): void {
  cachedRuntime = undefined;
  cachedManifest = undefined;
}
