import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createHashEmbeddingService } from "./bedrock-embedding-service.js";
import { buildSearchInRadiusFromCorpus } from "./build-search-in-radius-from-corpus.js";
import { hybridRetrieveRoofingChunks } from "./hybrid-retrieve-roofing-chunks.js";
import { createInMemoryRetrievalIndex } from "./in-memory-retrieval-index.js";
import { buildChunksByIdMap } from "./load-lee-fixture-corpus.js";
import { loadFixtureCorpusChunks } from "./index-published-roofing-chunks.js";
import { embedChunksWithHash } from "./opensearch-retrieval-index.js";
import {
  LEE_DEMO_RADIUS_CENTER,
  LEE_DEMO_RADIUS_MILES,
} from "./index-published-roofing-chunks.js";
import {
  planRoofingOpportunityQuery,
  queryPlanToRetrievalFilters,
} from "./plan-roofing-opportunity-query.js";
import {
  AGENT_WEST_CHESTER_LEE_INDEX_COPY,
  runRoofingOpportunityAgent,
} from "./run-roofing-opportunity-agent.js";
import {
  CHESTER_DEMO_RAG_PROVENANCE,
  CHESTER_DEMO_RAG_SCHEMA_VERSION,
} from "./chester-demo-rag-contract.js";

const ragDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const monorepoRootPath = path.join(ragDirectoryPath, "../../../..");
const goldenQueriesDirectoryPath = path.join(monorepoRootPath, "fixtures/rag/queries");

interface GoldenRoofingOpportunityQuery {
  caseId: string;
  description: string;
  input: {
    question: string;
    countyHint: string;
    center?: { lat: number; lng: number };
    radiusMiles?: number;
  };
  expected: {
    refusal?: boolean;
    retrievedChunkIds: string[];
    sourceUris: string[];
    mustNotClaim: string[];
    mustContain?: string[];
  };
}

async function loadGoldenQueries(): Promise<GoldenRoofingOpportunityQuery[]> {
  const fileNames = (await readdir(goldenQueriesDirectoryPath)).filter((fileName) =>
    fileName.endsWith(".json"),
  );
  const queries: GoldenRoofingOpportunityQuery[] = [];
  for (const fileName of fileNames) {
    const raw = await readFile(path.join(goldenQueriesDirectoryPath, fileName), "utf8");
    queries.push(JSON.parse(raw) as GoldenRoofingOpportunityQuery);
  }
  return queries;
}

const goldenQueries = await loadGoldenQueries();

describe("golden roofing opportunity queries", () => {
  it.each(goldenQueries)(
    "$caseId matches fixture retrieval and honest citations",
    async (golden) => {
      const chunks = await loadFixtureCorpusChunks();
      const retrievalIndex = createInMemoryRetrievalIndex();
      await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));
      const chunksById = buildChunksByIdMap(chunks);
      const embeddingService = createHashEmbeddingService();

      const center = golden.input.center ?? LEE_DEMO_RADIUS_CENTER;
      const radiusMiles = golden.input.radiusMiles ?? LEE_DEMO_RADIUS_MILES;

      const queryPlan = planRoofingOpportunityQuery({
        message: golden.input.question,
        center,
        radiusMiles,
      });
      const filters = {
        ...queryPlanToRetrievalFilters(queryPlan, {
          county: golden.input.countyHint,
          center,
          radiusMiles,
        }),
        ...(golden.input.countyHint === "chester-demo"
          ? {
              provenance: CHESTER_DEMO_RAG_PROVENANCE,
              schemaVersion: CHESTER_DEMO_RAG_SCHEMA_VERSION,
              ...(queryPlan.intent === "open_permits"
                ? { documentKind: "roofing_permit" as const }
                : {}),
            }
          : {}),
      };

      const retrieved = await hybridRetrieveRoofingChunks({
        question: queryPlan.semanticQuery,
        filters,
        embeddingService,
        retrievalIndex,
        chunksById,
      });

      const retrievedChunkIds = retrieved.map((entry) => entry.chunk.chunkId);
      for (const expectedChunkId of golden.expected.retrievedChunkIds) {
        expect(retrievedChunkIds).toContain(expectedChunkId);
      }

      const includeMapContext = golden.caseId !== "golden-lee-missing-map-context";

      const response = await runRoofingOpportunityAgent(
        {
          county: golden.input.countyHint,
          message: golden.input.question,
          center: includeMapContext ? center : undefined,
          radiusMiles: includeMapContext ? radiusMiles : undefined,
        },
        {
          retrievalIndex,
          embeddingService,
          chunksById,
          searchInRadius: includeMapContext
            ? buildSearchInRadiusFromCorpus(chunks)
            : undefined,
        },
      );

      if (golden.expected.refusal === true) {
        expect(response.answer).toBe(AGENT_WEST_CHESTER_LEE_INDEX_COPY);
        expect(response.citations).toEqual([]);
        return;
      }

      expect(response.indexed).toBe(true);
      const citationSourceUris = response.citations.map(
        (citation) => citation.sourceUri,
      );
      for (const sourceUri of golden.expected.sourceUris) {
        expect(citationSourceUris).toContain(sourceUri);
      }
      for (const forbidden of golden.expected.mustNotClaim) {
        expect(response.answer.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      for (const required of golden.expected.mustContain ?? []) {
        expect(response.answer.toLowerCase()).toContain(required.toLowerCase());
      }
    },
  );
});
