/**
 * Chester-demo RAG readiness checks for agent.ask and indexer activation.
 */
import type { Client } from "@opensearch-project/opensearch";

import {
  CHESTER_DEMO_RAG_COUNTY,
  CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS,
  CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS,
  CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES,
  CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS,
  CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR,
  CHESTER_DEMO_RAG_PROVENANCE,
  CHESTER_DEMO_RAG_READ_ALIAS,
  CHESTER_DEMO_RAG_RETRIEVAL_MODE,
  CHESTER_DEMO_RAG_SCHEMA_VERSION,
  isChesterDemoRagCounty,
} from "./chester-demo-rag-contract.js";
import type { RagCorpusManifest } from "./rag-corpus-manifest.js";

export function isChesterDemoRagEnabled(): boolean {
  return process.env.CHESTER_DEMO_RAG_ENABLED !== "0";
}

export function manifestSupportsChesterDemoRag(
  manifest: RagCorpusManifest | null | undefined,
): boolean {
  if (manifest === null || manifest === undefined) {
    return false;
  }
  return (
    manifest.corpusSource === "chester_demo_published_corpus" &&
    manifest.datasetKey === CHESTER_DEMO_RAG_COUNTY &&
    manifest.retrievalMode === CHESTER_DEMO_RAG_RETRIEVAL_MODE &&
    manifest.provenance === CHESTER_DEMO_RAG_PROVENANCE &&
    manifest.schemaVersion === CHESTER_DEMO_RAG_SCHEMA_VERSION &&
    manifest.indexedCount === CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS &&
    manifest.propertySummaryCount === CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES &&
    manifest.permitChunkCount === CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS &&
    manifest.longOpenPermitChunkCount ===
      CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS
  );
}

export async function countChesterDemoDocumentsInIndex(
  client: Client,
  indexName: string,
): Promise<{
  total: number;
  propertySummaries: number;
  permitChunks: number;
  longOpenPermits: number;
  leeRows: number;
  realChesterRows: number;
}> {
  const baseFilter = [
    { term: { county: CHESTER_DEMO_RAG_COUNTY } },
    { term: { provenance: CHESTER_DEMO_RAG_PROVENANCE } },
    { term: { schema_version: CHESTER_DEMO_RAG_SCHEMA_VERSION } },
  ];

  const countFor = async (
    extraMust: Record<string, unknown>[] = [],
  ): Promise<number> => {
    const response = await client.count({
      index: indexName,
      body: {
        query: {
          bool: {
            filter: [...baseFilter, ...extraMust],
          },
        },
      },
    });
    return typeof response.body.count === "number" ? response.body.count : 0;
  };

  const [
    total,
    propertySummaries,
    permitChunks,
    longOpenPermits,
    leeRows,
    realChesterRows,
  ] = await Promise.all([
    countFor(),
    countFor([{ term: { documentKind: "property_summary" } }]),
    countFor([{ term: { documentKind: "roofing_permit" } }]),
    countFor([
      { term: { documentKind: "roofing_permit" } },
      {
        range: {
          open_permit_years: { gte: CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR },
        },
      },
    ]),
    client
      .count({ index: indexName, body: { query: { term: { county: "lee" } } } })
      .then((response) =>
        typeof response.body.count === "number" ? response.body.count : 0,
      ),
    client
      .count({ index: indexName, body: { query: { term: { county: "chester" } } } })
      .then((response) =>
        typeof response.body.count === "number" ? response.body.count : 0,
      ),
  ]);

  return {
    total,
    propertySummaries,
    permitChunks,
    longOpenPermits,
    leeRows,
    realChesterRows,
  };
}

export async function resolveChesterDemoReadIndexName(
  client: Client,
): Promise<string | null> {
  try {
    const aliasResponse = await client.indices.getAlias({
      name: CHESTER_DEMO_RAG_READ_ALIAS,
    });
    const indexNames = Object.keys(aliasResponse.body);
    if (indexNames.length !== 1) {
      return null;
    }
    return indexNames[0] ?? null;
  } catch {
    return null;
  }
}

export async function isChesterDemoRagReady(arguments_: {
  county: string;
  manifest: RagCorpusManifest | null;
  client?: Client;
  indexName?: string;
}): Promise<boolean> {
  if (!isChesterDemoRagCounty(arguments_.county)) {
    return false;
  }
  if (!isChesterDemoRagEnabled()) {
    return false;
  }
  if (!manifestSupportsChesterDemoRag(arguments_.manifest)) {
    return false;
  }
  if (arguments_.client === undefined || arguments_.indexName === undefined) {
    return true;
  }

  const counts = await countChesterDemoDocumentsInIndex(
    arguments_.client,
    arguments_.indexName,
  );
  return (
    counts.total === CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS &&
    counts.propertySummaries === CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES &&
    counts.permitChunks === CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS &&
    counts.longOpenPermits === CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS &&
    counts.leeRows === 0 &&
    counts.realChesterRows === 0
  );
}
