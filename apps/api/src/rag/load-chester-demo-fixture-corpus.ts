/**
 * Loads Chester-demo fixture corpus for local tests and golden replay.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseRoofingOpportunityChunkJsonl,
  type RoofingOpportunityChunk,
} from "./roofing-opportunity-chunk.js";

const ragDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const monorepoRootPath = path.join(ragDirectoryPath, "../../../..");
const chesterDemoFixturePath = path.join(
  monorepoRootPath,
  "fixtures/rag/corpus/chester-demo-property-chunks.jsonl",
);

export async function loadChesterDemoFixtureCorpus(): Promise<
  RoofingOpportunityChunk[]
> {
  const jsonl = await readFile(chesterDemoFixturePath, "utf8");
  return parseRoofingOpportunityChunkJsonl(jsonl);
}

export function buildChunksByIdMap(
  chunks: RoofingOpportunityChunk[],
): Map<string, RoofingOpportunityChunk> {
  const map = new Map<string, RoofingOpportunityChunk>();
  for (const chunk of chunks) {
    map.set(chunk.chunkId, chunk);
  }
  return map;
}
