/**
 * Loads fixture corpus JSONL from the monorepo fixtures path.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseRoofingOpportunityChunkJsonl,
  type RoofingOpportunityChunk,
} from "./roofing-opportunity-chunk.js";

const ragDirectoryPath = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves fixture corpus directory for local monorepo or bundled Lambda output.
 */
export function resolveFixtureCorpusDirectory(): string {
  const bundledCorpusDirectoryPath = path.join(ragDirectoryPath, "fixtures/rag/corpus");
  if (existsSync(bundledCorpusDirectoryPath)) {
    return bundledCorpusDirectoryPath;
  }
  return path.join(ragDirectoryPath, "../../../../fixtures/rag/corpus");
}

/**
 * Default Lee fixture corpus path.
 */
export const DEFAULT_LEE_FIXTURE_CORPUS_PATH = path.join(
  resolveFixtureCorpusDirectory(),
  "lee-property-chunks.jsonl",
);

/**
 * Reads and parses the Lee fixture corpus.
 */
export async function loadLeeFixtureCorpus(
  corpusPath: string = DEFAULT_LEE_FIXTURE_CORPUS_PATH,
): Promise<RoofingOpportunityChunk[]> {
  const jsonl = await readFile(corpusPath, "utf8");
  return parseRoofingOpportunityChunkJsonl(jsonl);
}

/**
 * Builds a chunk lookup map keyed by chunkId.
 */
export function buildChunksByIdMap(
  chunks: RoofingOpportunityChunk[],
): Map<string, RoofingOpportunityChunk> {
  return new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
}
