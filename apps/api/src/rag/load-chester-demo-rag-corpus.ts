/**
 * Loads Chester demo RAG corpus bytes from the staged S3 object or test overrides.
 *
 * Source: elephant-pipeline chester-demo.json ragCorpusUrl (CID
 * CHESTER_DEMO_RAG_SOURCE_CID). Operator stages the JSONL into the RagStack
 * corpus bucket — the indexer never fetches IPFS/Filebase at runtime.
 */
import { createHash } from "node:crypto";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
  CHESTER_DEMO_RAG_SOURCE_BYTES,
  CHESTER_DEMO_RAG_SOURCE_CID,
} from "./chester-demo-rag-contract.js";
import {
  createChesterDemoCorpusStatsAccumulator,
  finalizeChesterDemoCorpusStats,
  recordChesterDemoCorpusChunk,
  summarizeChesterDemoCorpus,
  validateChesterDemoCorpusStats,
  validateChesterDemoFixtureStats,
} from "./chester-demo-corpus-stats.js";
import {
  parseRoofingOpportunityChunkLine,
  type RoofingOpportunityChunk,
} from "./roofing-opportunity-chunk.js";

export interface ChesterDemoCorpusLoadResult {
  chunks: RoofingOpportunityChunk[];
  sourceBytes: number;
  sourceSha256: string;
  sourceCid: string;
  sourceUri: string;
}

export interface ChesterDemoCorpusBytesResult {
  bytes: Buffer;
  sourceBytes: number;
  sourceSha256: string;
  sourceCid: string;
  sourceUri: string;
}

function validateCorpusBytes(bytes: Buffer): {
  sourceBytes: number;
  sourceSha256: string;
  sourceCid: string;
} {
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== CHESTER_DEMO_RAG_SOURCE_BYTES) {
    throw new Error(
      `Chester demo corpus byte length mismatch: expected ${String(CHESTER_DEMO_RAG_SOURCE_BYTES)}, got ${String(bytes.byteLength)}`,
    );
  }
  return {
    sourceBytes: bytes.byteLength,
    sourceSha256,
    sourceCid: CHESTER_DEMO_RAG_SOURCE_CID,
  };
}

async function readCorpusBytesFromS3(arguments_: {
  bucketName: string;
  objectKey?: string;
}): Promise<Buffer> {
  const s3 = new S3Client({});
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: arguments_.bucketName,
      Key: arguments_.objectKey ?? CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
    }),
  );
  const body = await response.Body?.transformToByteArray();
  if (body === undefined) {
    throw new Error("Chester demo corpus S3 object returned an empty body");
  }
  return Buffer.from(body);
}

/**
 * Loads Chester demo corpus bytes and source metadata without parsing documents.
 */
export async function fetchChesterDemoPublishedCorpusBytes(arguments_?: {
  bucketName?: string;
  objectKey?: string;
  readBytes?: () => Promise<Buffer>;
}): Promise<ChesterDemoCorpusBytesResult> {
  const bucketName = arguments_?.bucketName ?? process.env.RAG_CORPUS_BUCKET_NAME;
  const objectKey = arguments_?.objectKey ?? CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY;

  const bytes =
    arguments_?.readBytes !== undefined
      ? await arguments_.readBytes()
      : bucketName !== undefined && bucketName.length > 0
        ? await readCorpusBytesFromS3({ bucketName, objectKey })
        : (() => {
            throw new Error(
              "Chester demo corpus requires RAG_CORPUS_BUCKET_NAME or an injected readBytes()",
            );
          })();

  const validated = validateCorpusBytes(bytes);
  const sourceUri = `s3://${bucketName ?? "local"}/${objectKey}`;

  return {
    bytes,
    sourceBytes: validated.sourceBytes,
    sourceSha256: validated.sourceSha256,
    sourceCid: validated.sourceCid,
    sourceUri,
  };
}

/**
 * Streams Chester demo corpus lines through a callback without retaining all chunks.
 */
export async function forEachChesterDemoPublishedCorpusChunk(arguments_: {
  bytes: Buffer;
  validateFullCorpus?: boolean;
  onChunk: (chunk: RoofingOpportunityChunk) => void | Promise<void>;
}): Promise<ReturnType<typeof finalizeChesterDemoCorpusStats>> {
  const accumulator = createChesterDemoCorpusStatsAccumulator();
  let lineStart = 0;

  for (let offset = 0; offset <= arguments_.bytes.length; offset += 1) {
    const isLineBreak =
      offset === arguments_.bytes.length || arguments_.bytes[offset] === 0x0a;
    if (!isLineBreak) {
      continue;
    }

    const line = arguments_.bytes.subarray(lineStart, offset).toString("utf8").trim();
    lineStart = offset + 1;
    if (line.length === 0) {
      continue;
    }

    const chunk = parseRoofingOpportunityChunkLine(line);
    recordChesterDemoCorpusChunk(accumulator, chunk);
    await arguments_.onChunk(chunk);
  }

  const stats = finalizeChesterDemoCorpusStats(accumulator);
  const validationErrors =
    arguments_.validateFullCorpus === false
      ? validateChesterDemoFixtureStats(stats)
      : validateChesterDemoCorpusStats(stats);
  if (validationErrors.length > 0) {
    throw new Error(
      `Chester demo corpus validation failed: ${validationErrors.join("; ")}`,
    );
  }

  return stats;
}

/**
 * Fetches and parses the published Chester demo RAG corpus.
 */
export async function loadChesterDemoPublishedCorpus(arguments_?: {
  bucketName?: string;
  objectKey?: string;
  readBytes?: () => Promise<Buffer>;
  validateFullCorpus?: boolean;
}): Promise<RoofingOpportunityChunk[]> {
  const result = await loadChesterDemoPublishedCorpusWithMetadata(arguments_);
  return result.chunks;
}

/**
 * Fetches Chester demo corpus and returns source metadata for manifest activation.
 */
export async function loadChesterDemoPublishedCorpusWithMetadata(arguments_?: {
  bucketName?: string;
  objectKey?: string;
  readBytes?: () => Promise<Buffer>;
  validateFullCorpus?: boolean;
}): Promise<ChesterDemoCorpusLoadResult> {
  const fetched = await fetchChesterDemoPublishedCorpusBytes(arguments_);
  const chunks: RoofingOpportunityChunk[] = [];
  await forEachChesterDemoPublishedCorpusChunk({
    bytes: fetched.bytes,
    validateFullCorpus: arguments_?.validateFullCorpus,
    onChunk: (chunk) => {
      chunks.push(chunk);
    },
  });

  return {
    chunks,
    sourceBytes: fetched.sourceBytes,
    sourceSha256: fetched.sourceSha256,
    sourceCid: fetched.sourceCid,
    sourceUri: fetched.sourceUri,
  };
}

export function summarizeLoadedChesterDemoCorpus(
  chunks: RoofingOpportunityChunk[],
): ReturnType<typeof summarizeChesterDemoCorpus> {
  return summarizeChesterDemoCorpus(chunks);
}
