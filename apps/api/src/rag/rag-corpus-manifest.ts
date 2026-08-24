/**
 * S3-persisted RAG corpus manifest for cross-Lambda freshness metadata.
 */
import { createHash } from "node:crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";

import {
  CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
  CHESTER_DEMO_RAG_READ_ALIAS,
  CHESTER_DEMO_RAG_RETRIEVAL_MODE,
} from "./chester-demo-rag-contract.js";

export const RAG_CORPUS_MANIFEST_OBJECT_KEY = "corpus/latest-manifest.json";

export const ragCorpusManifestSchema = z.object({
  indexedAt: z.string().min(1),
  indexedCount: z.number().int().nonnegative(),
  sourcePropertyCount: z.number().int().nonnegative(),
  permitChunkCount: z.number().int().nonnegative(),
  corpusSource: z.enum([
    "published_elephant_mcp",
    "lee_fixture_corpus",
    "chester_demo_published_corpus",
  ]),
  datasetKey: z.string().min(1).optional(),
  sourceUri: z.string().min(1).optional(),
  sourceCid: z.string().min(1).optional(),
  sourceSha256: z.string().min(1).optional(),
  sourceBytes: z.number().int().nonnegative().optional(),
  schemaVersion: z.number().int().positive().optional(),
  provenance: z.string().min(1).optional(),
  concreteIndexName: z.string().min(1).optional(),
  readAlias: z.string().min(1).optional(),
  retrievalMode: z.string().min(1).optional(),
  propertySummaryCount: z.number().int().nonnegative().optional(),
  longOpenPermitChunkCount: z.number().int().nonnegative().optional(),
  activatedAt: z.string().min(1).optional(),
});

export type RagCorpusManifest = z.infer<typeof ragCorpusManifestSchema>;

export function hashCorpusSource(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Writes the latest corpus manifest to S3 for agent.ask freshness across cold starts.
 */
export async function writeRagCorpusManifestToS3(arguments_: {
  bucketName: string;
  manifest: RagCorpusManifest;
  objectKey?: string;
}): Promise<void> {
  const s3 = new S3Client({});
  await s3.send(
    new PutObjectCommand({
      Bucket: arguments_.bucketName,
      Key: arguments_.objectKey ?? RAG_CORPUS_MANIFEST_OBJECT_KEY,
      Body: JSON.stringify(arguments_.manifest),
      ContentType: "application/json",
    }),
  );
}

/**
 * Loads the latest corpus manifest from S3 when present.
 */
export async function loadRagCorpusManifestFromS3(arguments_: {
  bucketName: string;
  objectKey?: string;
}): Promise<RagCorpusManifest | null> {
  const s3 = new S3Client({});
  const keys = [
    arguments_.objectKey,
    CHESTER_DEMO_RAG_MANIFEST_OBJECT_KEY,
    RAG_CORPUS_MANIFEST_OBJECT_KEY,
  ].filter((key): key is string => key !== undefined);

  for (const objectKey of keys) {
    try {
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: arguments_.bucketName,
          Key: objectKey,
        }),
      );
      const body = await response.Body?.transformToString();
      if (body === undefined || body.length === 0) {
        continue;
      }
      return ragCorpusManifestSchema.parse(JSON.parse(body));
    } catch {
      continue;
    }
  }
  return null;
}

export function buildChesterDemoManifest(arguments_: {
  indexedAt: string;
  indexedCount: number;
  sourcePropertyCount: number;
  permitChunkCount: number;
  propertySummaryCount: number;
  longOpenPermitChunkCount: number;
  sourceUri: string;
  sourceCid: string;
  sourceSha256: string;
  sourceBytes: number;
  schemaVersion: number;
  provenance: string;
  concreteIndexName: string;
}): RagCorpusManifest {
  return {
    indexedAt: arguments_.indexedAt,
    indexedCount: arguments_.indexedCount,
    sourcePropertyCount: arguments_.sourcePropertyCount,
    permitChunkCount: arguments_.permitChunkCount,
    corpusSource: "chester_demo_published_corpus",
    datasetKey: "chester-demo",
    sourceUri: arguments_.sourceUri,
    sourceCid: arguments_.sourceCid,
    sourceSha256: arguments_.sourceSha256,
    sourceBytes: arguments_.sourceBytes,
    schemaVersion: arguments_.schemaVersion,
    provenance: arguments_.provenance,
    concreteIndexName: arguments_.concreteIndexName,
    readAlias: CHESTER_DEMO_RAG_READ_ALIAS,
    retrievalMode: CHESTER_DEMO_RAG_RETRIEVAL_MODE,
    propertySummaryCount: arguments_.propertySummaryCount,
    longOpenPermitChunkCount: arguments_.longOpenPermitChunkCount,
    activatedAt: arguments_.indexedAt,
  };
}
