/**
 * Operator CLI: download Chester demo RAG corpus from the published handoff URL
 * and stage it into the RagStack corpus bucket (idempotent by SHA-256).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
  CHESTER_DEMO_RAG_SOURCE_BYTES,
  CHESTER_DEMO_RAG_SOURCE_CID,
  CHESTER_DEMO_RAG_SOURCE_URL,
} from "../src/rag/chester-demo-rag-contract.js";

const scriptDirectoryPath = path.dirname(fileURLToPath(import.meta.url));
const defaultStagingPath = path.join(
  scriptDirectoryPath,
  "../../../.staging/chester-demo-corpus.jsonl",
);

async function resolveCorpusBytes(): Promise<Buffer> {
  const stagingPath =
    process.env.CHESTER_DEMO_CORPUS_STAGING_PATH ?? defaultStagingPath;
  if (process.env.CHESTER_DEMO_CORPUS_LOCAL_PATH !== undefined) {
    return readFile(process.env.CHESTER_DEMO_CORPUS_LOCAL_PATH);
  }
  try {
    return await readFile(stagingPath);
  } catch {
    const response = await fetch(CHESTER_DEMO_RAG_SOURCE_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to download Chester demo corpus: HTTP ${String(response.status)}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(path.dirname(stagingPath), { recursive: true });
    await writeFile(stagingPath, bytes);
    return bytes;
  }
}

function validateCorpusBytes(bytes: Buffer): string {
  if (bytes.byteLength !== CHESTER_DEMO_RAG_SOURCE_BYTES) {
    throw new Error(
      `Chester demo corpus byte length mismatch: expected ${String(CHESTER_DEMO_RAG_SOURCE_BYTES)}, got ${String(bytes.byteLength)}`,
    );
  }
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const bucketName = process.env.RAG_CORPUS_BUCKET_NAME;
  if (bucketName === undefined || bucketName.length === 0) {
    throw new Error("RAG_CORPUS_BUCKET_NAME is required");
  }

  const bytes = await resolveCorpusBytes();
  const sourceSha256 = validateCorpusBytes(bytes);
  const s3 = new S3Client({});

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
      }),
    );
    if (
      head.Metadata?.sourcesha256 === sourceSha256 &&
      head.ContentLength === bytes.byteLength
    ) {
      console.log(
        JSON.stringify({
          msg: "chester-demo.corpus.already_staged",
          bucketName,
          objectKey: CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
          sourceCid: CHESTER_DEMO_RAG_SOURCE_CID,
          sourceSha256,
          sourceBytes: bytes.byteLength,
        }),
      );
      return;
    }
  } catch {
    // Object missing or checksum mismatch — upload below.
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
      Body: bytes,
      ContentType: "application/x-ndjson",
      Metadata: {
        sourceCid: CHESTER_DEMO_RAG_SOURCE_CID,
        sourceSha256,
      },
    }),
  );

  console.log(
    JSON.stringify({
      msg: "chester-demo.corpus.staged",
      bucketName,
      objectKey: CHESTER_DEMO_RAG_CORPUS_OBJECT_KEY,
      sourceCid: CHESTER_DEMO_RAG_SOURCE_CID,
      sourceSha256,
      sourceBytes: bytes.byteLength,
    }),
  );
}

await main();
