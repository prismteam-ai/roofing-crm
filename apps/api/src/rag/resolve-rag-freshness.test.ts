import { afterEach, describe, expect, it, vi } from "vitest";

import * as loadLeeFixtureCorpusModule from "./load-lee-fixture-corpus.js";
import { CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY } from "./chester-demo-rag-contract.js";
import { resolveRagFreshness } from "./resolve-rag-freshness.js";
import * as ragCorpusManifestModule from "./rag-corpus-manifest.js";

describe("resolveRagFreshness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // Given Lambda without OPENSEARCH_ENDPOINT (fixtures are not in the image)
  // When freshness is resolved
  // Then it must not read lee-property-chunks.jsonl (that path 500s agent.ask)
  it("does not read fixture files on Lambda without OpenSearch", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    delete process.env.OPENSEARCH_ENDPOINT;

    const loadSpy = vi
      .spyOn(loadLeeFixtureCorpusModule, "loadLeeFixtureCorpus")
      .mockRejectedValue(
        new Error(
          "ENOENT: no such file or directory, open '/fixtures/rag/corpus/lee-property-chunks.jsonl'",
        ),
      );

    const freshness = await resolveRagFreshness();

    expect(loadSpy).not.toHaveBeenCalled();
    expect(freshness.documentCount).toBeNull();
    expect(freshness.indexedAt).toBeNull();
  });

  it("reads persisted S3 manifest before OpenSearch count", async () => {
    vi.stubEnv("OPENSEARCH_ENDPOINT", "https://example.aoss.amazonaws.com");
    vi.stubEnv("RAG_CORPUS_BUCKET_NAME", "rag-corpus-bucket");

    const manifestSpy = vi
      .spyOn(ragCorpusManifestModule, "loadRagCorpusManifestFromS3")
      .mockResolvedValue({
        indexedAt: "2026-08-24T12:00:00.000Z",
        indexedCount: 48,
        sourcePropertyCount: 24,
        permitChunkCount: 6,
        corpusSource: "published_elephant_mcp",
      });

    const freshness = await resolveRagFreshness();

    expect(manifestSpy).toHaveBeenCalledWith({
      bucketName: "rag-corpus-bucket",
      objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
    });
    expect(freshness).toEqual({
      indexedAt: "2026-08-24T12:00:00.000Z",
      corpusSource: "published_elephant_mcp",
      documentCount: 48,
    });
  });
});
