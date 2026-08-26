/**
 * Published Chester-demo RAG corpus contract.
 *
 * Exact counts are fail-closed: a republish without updating these constants
 * keeps RAG on structured fallback until the contract is refreshed.
 */
import { CHESTER_DEMO_RAG_CORPUS_URL } from "../elephant-mcp-env.js";

export const CHESTER_DEMO_RAG_COUNTY = "chester-demo" as const;
export const CHESTER_DEMO_RAG_PROVENANCE = "synthetic_demo" as const;
export const CHESTER_DEMO_RAG_SCHEMA_VERSION = 1;
export const CHESTER_DEMO_RAG_SOURCE_CID =
  "QmY9SdpRj2pHxSMJNCTRzWfbMPe37hikpevT8qHeEnQ7Yp";
export const CHESTER_DEMO_RAG_SOURCE_BYTES = 61_273_152;
export const CHESTER_DEMO_RAG_SOURCE_URL = CHESTER_DEMO_RAG_CORPUS_URL;

export const CHESTER_DEMO_RAG_READ_ALIAS =
  "roofing-opportunity-chunks-chester-demo-read";
export const CHESTER_DEMO_RAG_RETRIEVAL_MODE = "bm25_structured_v1" as const;

export const CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS = 84_236;
export const CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES = 84_086;
export const CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS = 150;
export const CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS = 12;
export const CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR = 5;

export const CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY =
  "corpus/chester-demo/latest-manifest.json";

/** Staged Chester demo corpus JSONL in the RagStack corpus bucket. */
export const CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY = "chester-demo/corpus.jsonl";

export function isChesterDemoRagCounty(county: string): boolean {
  return county.trim().toLowerCase() === CHESTER_DEMO_RAG_COUNTY;
}

export function isRealChesterCounty(county: string): boolean {
  return county.trim().toLowerCase() === "chester";
}

export function buildChesterDemoConcreteIndexName(sourceHashPrefix: string): string {
  const normalized = sourceHashPrefix.replace(/[^a-z0-9]/gi, "").slice(0, 12);
  return `roofing-opportunity-chunks-chester-demo-v1-${normalized}`;
}
