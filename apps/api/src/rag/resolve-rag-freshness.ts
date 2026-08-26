/**
 * Resolves corpus freshness metadata for agent.ask responses.
 */
import type { AgentAskFreshness } from "./agent-ask-contract.js";
import { loadLeeFixtureCorpus } from "./load-lee-fixture-corpus.js";
import {
  createOpenSearchClient,
  DEFAULT_RAG_INDEX_NAME,
} from "./opensearch-retrieval-index.js";
import { CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY } from "./chester-demo-rag-contract.js";
import { loadRagCorpusManifestFromS3 } from "./rag-corpus-manifest.js";

function isLambdaRuntimeWithoutOpenSearch(): boolean {
  const lambdaFunctionName = process.env["AWS_LAMBDA_FUNCTION_NAME"];
  return (
    lambdaFunctionName !== undefined &&
    lambdaFunctionName.length > 0 &&
    process.env["OPENSEARCH_ENDPOINT"] === undefined
  );
}

/**
 * Builds freshness metadata from runtime environment and optional index stats.
 */
export async function resolveRagFreshness(): Promise<AgentAskFreshness> {
  const corpusSource = "lee_fixture_corpus";

  if (isLambdaRuntimeWithoutOpenSearch()) {
    return {
      indexedAt: null,
      corpusSource,
      documentCount: null,
    };
  }

  const corpusBucketName = process.env["RAG_CORPUS_BUCKET_NAME"];
  if (corpusBucketName !== undefined && corpusBucketName.length > 0) {
    const manifest = await loadRagCorpusManifestFromS3({
      bucketName: corpusBucketName,
      objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
    });
    if (manifest !== null) {
      return {
        indexedAt: manifest.indexedAt,
        corpusSource: manifest.corpusSource,
        documentCount: manifest.indexedCount,
      };
    }
    const legacyManifest = await loadRagCorpusManifestFromS3({
      bucketName: corpusBucketName,
    });
    if (legacyManifest !== null) {
      return {
        indexedAt: legacyManifest.indexedAt,
        corpusSource: legacyManifest.corpusSource,
        documentCount: legacyManifest.indexedCount,
      };
    }
  }

  if (process.env["OPENSEARCH_ENDPOINT"] !== undefined) {
    try {
      const client = createOpenSearchClient();
      const indexName = process.env.RAG_INDEX_NAME ?? DEFAULT_RAG_INDEX_NAME;
      const countResponse = await client.count({ index: indexName });
      const documentCount =
        typeof countResponse.body.count === "number" ? countResponse.body.count : null;
      return {
        indexedAt: process.env.RAG_CORPUS_INDEXED_AT ?? null,
        corpusSource,
        documentCount,
      };
    } catch {
      return {
        indexedAt: process.env.RAG_CORPUS_INDEXED_AT ?? null,
        corpusSource,
        documentCount: null,
      };
    }
  }

  const chunks = await loadLeeFixtureCorpus();
  return {
    indexedAt: null,
    corpusSource,
    documentCount: chunks.length,
  };
}
