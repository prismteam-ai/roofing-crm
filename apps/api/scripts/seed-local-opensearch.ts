#!/usr/bin/env tsx
/**
 * Seeds local Docker OpenSearch from fixtures/rag/corpus/*.jsonl.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseRoofingOpportunityChunkJsonl } from "../src/rag/roofing-opportunity-chunk.js";
import {
  createOpenSearchClient,
  DEFAULT_RAG_INDEX_NAME,
  ensureOpenSearchIndex,
  createOpenSearchRetrievalIndex,
  embedChunksWithHash,
} from "../src/rag/opensearch-retrieval-index.js";

const scriptDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const monorepoRootPath = path.join(scriptDirectoryPath, "../../..");
const corpusDirectoryPath = path.join(monorepoRootPath, "fixtures/rag/corpus");

async function main(): Promise<void> {
  const client = createOpenSearchClient();
  const indexName = process.env.RAG_INDEX_NAME ?? DEFAULT_RAG_INDEX_NAME;
  await ensureOpenSearchIndex(client, indexName);

  const corpusFiles = (await readdir(corpusDirectoryPath)).filter((fileName) =>
    fileName.endsWith(".jsonl"),
  );

  const retrievalIndex = createOpenSearchRetrievalIndex(client, indexName);
  let totalChunks = 0;

  for (const corpusFileName of corpusFiles) {
    const jsonl = await readFile(
      path.join(corpusDirectoryPath, corpusFileName),
      "utf8",
    );
    const chunks = parseRoofingOpportunityChunkJsonl(jsonl);
    await retrievalIndex.upsertChunks(embedChunksWithHash(chunks));
    totalChunks += chunks.length;
    console.log(`Seeded ${String(chunks.length)} chunks from ${corpusFileName}`);
  }

  console.log(
    `OpenSearch index ${indexName} now has ${String(totalChunks)} fixture chunks.`,
  );
}

void main();
