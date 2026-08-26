/**
 * Cost-gated indexer: Chester-demo published corpus for hosted challenge demos.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  parseElephantMcpToolJson,
  type ElephantMcpToolClient,
} from "@roofing-crm-challenge/elephant-client";

import { mapElephantOraclePropertyPayload } from "../map-elephant-oracle-property-payload.js";
import { createQueryPropertiesInBoundingBoxLoader } from "../query-properties-in-bounding-box.js";
import { boundingBoxForRadiusMiles } from "../routers/search.js";
import { haversineDistanceMiles } from "@roofing-crm-challenge/shared";
import { buildRoofingOpportunityChunks } from "./build-roofing-opportunity-chunks.js";
import { resolveEmbeddingService } from "./bedrock-embedding-service.js";
import {
  buildChesterDemoConcreteIndexName,
  CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
  CHESTER_DEMO_RAG_PROVENANCE,
  CHESTER_DEMO_RAG_SCHEMA_VERSION,
} from "./chester-demo-rag-contract.js";
import {
  countChesterDemoDocumentsInIndex,
  resolveChesterDemoReadIndexName,
} from "./chester-demo-rag-readiness.js";
import {
  loadLeeFixtureCorpus,
  resolveFixtureCorpusDirectory,
} from "./load-lee-fixture-corpus.js";
import {
  fetchChesterDemoPublishedCorpusBytes,
  forEachChesterDemoPublishedCorpusChunk,
} from "./load-chester-demo-rag-corpus.js";
import {
  bulkUpsertChunksBatched,
  createOpenSearchClient,
  createOpenSearchRetrievalIndex,
  DEFAULT_RAG_INDEX_NAME,
  embedChunksForIndexing,
  embedChunksWithHash,
  ensureOpenSearchIndex,
  swapReadAlias,
} from "./opensearch-retrieval-index.js";
import {
  buildChesterDemoManifest,
  loadRagCorpusManifestFromS3,
  writeRagCorpusManifestToS3,
  type RagCorpusManifest,
} from "./rag-corpus-manifest.js";
import {
  roofingOpportunityChunkSchema,
  type RoofingOpportunityChunk,
} from "./roofing-opportunity-chunk.js";

const corpusDirectoryPath = resolveFixtureCorpusDirectory();

/** Matches queryProperties bbox row cap in query-properties-in-bounding-box.ts. */
export const DEFAULT_INDEXER_MAX_MCP_PROPERTIES = 200;

export const INDEXER_QUERY_PROPERTIES_TIMEOUT_MS = 480_000;
export const INDEXER_ENRICH_DEADLINE_MS = 500_000;
export const INDEXER_ENRICH_CONSECUTIVE_FAILURE_LIMIT = 8;
export const INDEXER_ENRICH_CONCURRENCY = 4;

export const LEE_DEMO_RADIUS_CENTER = {
  lat: 26.6406,
  lng: -81.8723,
} as const;

export const LEE_DEMO_RADIUS_MILES = 5;

export const CHESTER_DEMO_RADIUS_CENTER = {
  lat: 39.9607,
  lng: -75.6055,
} as const;

export const CHESTER_DEMO_RADIUS_MILES = 5;

export interface IndexPublishedRoofingChunksOptions {
  corpusBucketName?: string;
  corpusObjectKeyPrefix?: string;
  indexName?: string;
  maxMcpProperties?: number;
  elephantMcpToolClient?: ElephantMcpToolClient;
  fixtureOnly?: boolean;
  preferChesterDemoCorpus?: boolean;
  enrichDeadlineEpochMs?: number;
}

export interface IndexPublishedRoofingChunksResult {
  indexedCount: number;
  indexName: string;
  sourcePropertyCount: number;
  permitChunkCount: number;
  indexedAt: string;
  corpusSource: RagCorpusManifest["corpusSource"];
  skipped?: boolean;
}

export async function loadFixtureCorpusChunks(): Promise<RoofingOpportunityChunk[]> {
  const fixtureChunks = await loadLeeFixtureCorpus();
  const corpusFiles = await readdir(corpusDirectoryPath);
  const extraChunks: RoofingOpportunityChunk[] = [];

  for (const corpusFileName of corpusFiles) {
    if (!corpusFileName.endsWith(".jsonl")) {
      continue;
    }
    if (corpusFileName === "lee-property-chunks.jsonl") {
      continue;
    }
    const jsonl = await readFile(
      path.join(corpusDirectoryPath, corpusFileName),
      "utf8",
    );
    extraChunks.push(
      ...jsonl
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => roofingOpportunityChunkSchema.parse(JSON.parse(line))),
    );
  }

  return [...fixtureChunks, ...extraChunks];
}

async function loadOraclePropertyRecord(
  elephantMcpToolClient: ElephantMcpToolClient,
  county: string,
  propertyId: string,
) {
  const raw = await elephantMcpToolClient.callTool("getOracleProperty", {
    county,
    propertyId,
  });
  return mapElephantOraclePropertyPayload(parseElephantMcpToolJson(raw), propertyId);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as TInput);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function loadLeeDemoRadiusMcpChunks(
  elephantMcpToolClient: ElephantMcpToolClient,
  maxProperties: number = DEFAULT_INDEXER_MAX_MCP_PROPERTIES,
  enrichDeadlineEpochMs: number = Number.POSITIVE_INFINITY,
): Promise<RoofingOpportunityChunk[]> {
  const loadPropertiesInBoundingBox =
    createQueryPropertiesInBoundingBoxLoader(elephantMcpToolClient);
  const boundingBox = boundingBoxForRadiusMiles(
    LEE_DEMO_RADIUS_CENTER.lat,
    LEE_DEMO_RADIUS_CENTER.lng,
    LEE_DEMO_RADIUS_MILES,
  );
  const propertyRows = await loadPropertiesInBoundingBox({
    county: "lee",
    boundingBox,
    center: LEE_DEMO_RADIUS_CENTER,
  });

  const rowsInRadius = propertyRows
    .map((row) => ({
      row,
      distanceMiles: haversineDistanceMiles(
        LEE_DEMO_RADIUS_CENTER.lat,
        LEE_DEMO_RADIUS_CENTER.lng,
        row.latitude,
        row.longitude,
      ),
    }))
    .filter((entry) => entry.distanceMiles <= LEE_DEMO_RADIUS_MILES)
    .sort((left, right) => left.distanceMiles - right.distanceMiles)
    .slice(0, maxProperties);

  const indexedAt = new Date().toISOString();
  let consecutiveEnrichFailures = 0;
  const chunkGroups = await mapWithConcurrency(
    rowsInRadius,
    INDEXER_ENRICH_CONCURRENCY,
    async (entry) => {
      const enrichmentSkipped =
        Date.now() >= enrichDeadlineEpochMs ||
        consecutiveEnrichFailures >= INDEXER_ENRICH_CONSECUTIVE_FAILURE_LIMIT;
      let oraclePropertyRecord = null;
      if (!enrichmentSkipped) {
        try {
          oraclePropertyRecord = await loadOraclePropertyRecord(
            elephantMcpToolClient,
            "lee",
            entry.row.propertyId,
          );
          consecutiveEnrichFailures = 0;
        } catch {
          oraclePropertyRecord = null;
          consecutiveEnrichFailures += 1;
        }
      }
      return buildRoofingOpportunityChunks({
        county: "lee",
        propertyRow: entry.row,
        oraclePropertyRecord,
        indexedAt,
        provenance: "published_elephant_mcp",
      });
    },
  );

  return chunkGroups.flat();
}

export async function writeChunksJsonlToS3(arguments_: {
  bucketName: string;
  objectKey: string;
  chunks: RoofingOpportunityChunk[];
}): Promise<void> {
  const s3 = new S3Client({});
  const body = arguments_.chunks.map((chunk) => JSON.stringify(chunk)).join("\n");
  await s3.send(
    new PutObjectCommand({
      Bucket: arguments_.bucketName,
      Key: arguments_.objectKey,
      Body: body,
      ContentType: "application/x-ndjson",
    }),
  );
}

export async function writeRawJsonlBytesToS3(arguments_: {
  bucketName: string;
  objectKey: string;
  body: Buffer;
}): Promise<void> {
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: arguments_.bucketName,
      Key: arguments_.objectKey,
      Body: arguments_.body,
      ContentType: "application/x-ndjson",
    }),
  );
}

function dedupeChunksByChunkId(
  chunks: RoofingOpportunityChunk[],
): RoofingOpportunityChunk[] {
  const byChunkId = new Map<string, RoofingOpportunityChunk>();
  for (const chunk of chunks) {
    byChunkId.set(chunk.chunkId, chunk);
  }
  return [...byChunkId.values()];
}

async function indexLeeFixtureOrMcpChunks(
  options: IndexPublishedRoofingChunksOptions,
): Promise<IndexPublishedRoofingChunksResult> {
  const indexName = options.indexName ?? DEFAULT_RAG_INDEX_NAME;
  const indexedAt = new Date().toISOString();
  const fixtureChunks = await loadFixtureCorpusChunks();
  let mcpChunks: RoofingOpportunityChunk[] = [];
  let corpusSource: RagCorpusManifest["corpusSource"] = "lee_fixture_corpus";

  if (
    !options.fixtureOnly &&
    options.elephantMcpToolClient !== undefined &&
    (options.maxMcpProperties ?? DEFAULT_INDEXER_MAX_MCP_PROPERTIES) > 0
  ) {
    mcpChunks = await loadLeeDemoRadiusMcpChunks(
      options.elephantMcpToolClient,
      options.maxMcpProperties ?? DEFAULT_INDEXER_MAX_MCP_PROPERTIES,
      options.enrichDeadlineEpochMs ?? Number.POSITIVE_INFINITY,
    );
    if (mcpChunks.length > 0) {
      corpusSource = "published_elephant_mcp";
    }
  }

  const chunks = dedupeChunksByChunkId(
    options.fixtureOnly
      ? fixtureChunks
      : mcpChunks.length > 0
        ? mcpChunks
        : fixtureChunks,
  );

  const embeddingService = resolveEmbeddingService();
  const embeddedChunks =
    process.env.RAG_USE_BEDROCK_EMBEDDINGS === "1"
      ? await embedChunksForIndexing(chunks, (text) => embeddingService.embedText(text))
      : embedChunksWithHash(chunks);

  const client = createOpenSearchClient();
  await ensureOpenSearchIndex(client, indexName);
  const retrievalIndex = createOpenSearchRetrievalIndex(client, indexName);
  await retrievalIndex.upsertChunks(embeddedChunks);

  const sourcePropertyIds = new Set(chunks.map((chunk) => chunk.propertyId));
  const permitChunkCount = chunks.filter(
    (chunk) => chunk.documentKind === "roofing_permit",
  ).length;

  if (options.corpusBucketName !== undefined) {
    const prefix = options.corpusObjectKeyPrefix ?? "corpus/";
    await writeChunksJsonlToS3({
      bucketName: options.corpusBucketName,
      objectKey: `${prefix}${indexedAt}/roofing-opportunity-chunks.jsonl`,
      chunks,
    });
    await writeRagCorpusManifestToS3({
      bucketName: options.corpusBucketName,
      manifest: {
        indexedAt,
        indexedCount: chunks.length,
        sourcePropertyCount: sourcePropertyIds.size,
        permitChunkCount,
        corpusSource,
      },
    });
  }

  return {
    indexedCount: chunks.length,
    indexName,
    sourcePropertyCount: sourcePropertyIds.size,
    permitChunkCount,
    indexedAt,
    corpusSource,
  };
}

async function shouldSkipChesterDemoReindex(
  bucketName: string | undefined,
  sourceSha256: string,
): Promise<boolean> {
  if (bucketName === undefined) {
    return false;
  }
  const existing = await loadRagCorpusManifestFromS3({
    bucketName,
    objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
  });
  return existing?.sourceSha256 === sourceSha256;
}

export async function indexChesterDemoPublishedCorpus(
  options: IndexPublishedRoofingChunksOptions = {},
): Promise<IndexPublishedRoofingChunksResult> {
  const fetched = await fetchChesterDemoPublishedCorpusBytes({
    bucketName: options.corpusBucketName ?? process.env.RAG_CORPUS_BUCKET_NAME,
  });
  if (
    await shouldSkipChesterDemoReindex(options.corpusBucketName, fetched.sourceSha256)
  ) {
    const existingManifest = await loadRagCorpusManifestFromS3({
      bucketName: options.corpusBucketName!,
      objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
    });
    const readIndexName = await resolveChesterDemoReadIndexName(
      createOpenSearchClient(),
    );
    const indexName = readIndexName ?? existingManifest?.concreteIndexName ?? null;
    if (indexName === null) {
      throw new Error(
        "Chester demo corpus hash matches manifest but read alias is missing",
      );
    }
    return {
      indexedCount: existingManifest?.indexedCount ?? 0,
      indexName,
      sourcePropertyCount: existingManifest?.sourcePropertyCount ?? 0,
      permitChunkCount: existingManifest?.permitChunkCount ?? 0,
      indexedAt: existingManifest?.indexedAt ?? new Date().toISOString(),
      corpusSource: "chester_demo_published_corpus",
      skipped: true,
    };
  }

  const indexedAt = new Date().toISOString();
  const concreteIndexName = buildChesterDemoConcreteIndexName(fetched.sourceSha256);
  const client = createOpenSearchClient();
  const previousIndexName = await resolveChesterDemoReadIndexName(client).catch(
    () => null,
  );

  await ensureOpenSearchIndex(client, concreteIndexName);

  const propertyIds = new Set<string>();
  let pendingBatch: RoofingOpportunityChunk[] = [];
  const stats = await forEachChesterDemoPublishedCorpusChunk({
    bytes: fetched.bytes,
    onChunk: async (chunk) => {
      propertyIds.add(chunk.propertyId);
      pendingBatch.push(chunk);
      if (pendingBatch.length >= 500) {
        await bulkUpsertChunksBatched(client, concreteIndexName, pendingBatch, {
          refresh: false,
        });
        pendingBatch = [];
      }
    },
  });
  if (pendingBatch.length > 0) {
    await bulkUpsertChunksBatched(client, concreteIndexName, pendingBatch, {
      refresh: true,
    });
  } else {
    await client.indices.refresh({ index: concreteIndexName });
  }

  const counts = await countChesterDemoDocumentsInIndex(client, concreteIndexName);
  if (
    counts.leeRows > 0 ||
    counts.realChesterRows > 0 ||
    counts.total !== stats.totalDocuments
  ) {
    throw new Error(
      `Chester demo index validation failed after bulk upsert: ${JSON.stringify(counts)}`,
    );
  }

  const swappedFrom = await swapReadAlias(
    client,
    "roofing-opportunity-chunks-chester-demo-read",
    concreteIndexName,
  );
  console.log(
    JSON.stringify({
      metric: "rag.indexer.alias_activated",
      readAlias: "roofing-opportunity-chunks-chester-demo-read",
      concreteIndexName,
      swappedFrom,
      documentCount: stats.totalDocuments,
    }),
  );

  const manifest = buildChesterDemoManifest({
    indexedAt,
    indexedCount: stats.totalDocuments,
    sourcePropertyCount: propertyIds.size,
    permitChunkCount: counts.permitChunks,
    propertySummaryCount: counts.propertySummaries,
    longOpenPermitChunkCount: counts.longOpenPermits,
    sourceUri: fetched.sourceUri,
    sourceCid: fetched.sourceCid,
    sourceSha256: fetched.sourceSha256,
    sourceBytes: fetched.sourceBytes,
    schemaVersion: CHESTER_DEMO_RAG_SCHEMA_VERSION,
    provenance: CHESTER_DEMO_RAG_PROVENANCE,
    concreteIndexName,
  });

  try {
    if (options.corpusBucketName !== undefined) {
      const prefix = options.corpusObjectKeyPrefix ?? "corpus/chester-demo/";
      await writeRawJsonlBytesToS3({
        bucketName: options.corpusBucketName,
        objectKey: `${prefix}${indexedAt}/chester-demo-rag-corpus.jsonl`,
        body: fetched.bytes,
      });
      await writeRagCorpusManifestToS3({
        bucketName: options.corpusBucketName,
        manifest,
        objectKey: CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
      });
    }
  } catch (error) {
    if (swappedFrom !== null) {
      await swapReadAlias(
        client,
        "roofing-opportunity-chunks-chester-demo-read",
        swappedFrom,
      );
    }
    throw error;
  }

  void previousIndexName;

  return {
    indexedCount: stats.totalDocuments,
    indexName: concreteIndexName,
    sourcePropertyCount: manifest.sourcePropertyCount,
    permitChunkCount: manifest.permitChunkCount,
    indexedAt,
    corpusSource: "chester_demo_published_corpus",
  };
}

/**
 * Indexes published roofing chunks into OpenSearch.
 */
export async function indexPublishedRoofingChunks(
  options: IndexPublishedRoofingChunksOptions = {},
): Promise<IndexPublishedRoofingChunksResult> {
  const preferChesterDemoCorpus = options.preferChesterDemoCorpus ?? true;
  if (!options.fixtureOnly && preferChesterDemoCorpus) {
    return indexChesterDemoPublishedCorpus(options);
  }
  return indexLeeFixtureOrMcpChunks(options);
}

export async function handler(): Promise<IndexPublishedRoofingChunksResult> {
  const startedAtMs = Date.now();
  const fixtureOnly = process.env.RAG_INDEXER_FIXTURE_ONLY === "1";
  let elephantMcpToolClient: ElephantMcpToolClient | undefined;
  let elephantMcpTimeoutStore:
    | typeof import("../elephant-mcp-stdio-tool-client.js").elephantMcpTimeoutStore
    | undefined;
  if (!fixtureOnly && process.env.RAG_PREFER_CHESTER_DEMO_CORPUS === "0") {
    try {
      const stdioClientModule = await import("../elephant-mcp-stdio-tool-client.js");
      elephantMcpToolClient = stdioClientModule.createElephantMcpStdioToolClient();
      elephantMcpTimeoutStore = stdioClientModule.elephantMcpTimeoutStore;
    } catch {
      elephantMcpToolClient = undefined;
    }
  }

  const runIndexing = () =>
    indexPublishedRoofingChunks({
      corpusBucketName: process.env.RAG_CORPUS_BUCKET_NAME,
      indexName: process.env.RAG_INDEX_NAME ?? DEFAULT_RAG_INDEX_NAME,
      maxMcpProperties: Number(
        process.env.RAG_INDEXER_MAX_MCP_PROPERTIES ??
          String(DEFAULT_INDEXER_MAX_MCP_PROPERTIES),
      ),
      fixtureOnly,
      elephantMcpToolClient,
      preferChesterDemoCorpus: process.env.RAG_PREFER_CHESTER_DEMO_CORPUS !== "0",
      enrichDeadlineEpochMs: startedAtMs + INDEXER_ENRICH_DEADLINE_MS,
    });

  try {
    const result =
      elephantMcpTimeoutStore !== undefined
        ? await elephantMcpTimeoutStore.run(
            { queryPropertiesTimeoutMs: INDEXER_QUERY_PROPERTIES_TIMEOUT_MS },
            runIndexing,
          )
        : await runIndexing();
    process.env.RAG_CORPUS_INDEXED_AT = result.indexedAt;
    console.log(
      JSON.stringify({
        metric: "rag.indexer.documents_indexed",
        value: result.indexedCount,
        sourcePropertyCount: result.sourcePropertyCount,
        permitChunkCount: result.permitChunkCount,
        corpusSource: result.corpusSource,
        skipped: result.skipped === true,
        durationMs: Date.now() - startedAtMs,
      }),
    );
    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        metric: "rag.indexer.failure",
        durationMs: Date.now() - startedAtMs,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
