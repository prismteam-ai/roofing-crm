// T032: the production S3ConditionalWriter FetchPart's handler (apps/sync/handlers/fetchPart.ts)
// writes through — content-addressed keys, `If-None-Match: *` (AC-4/FR-004, architecture-
// constitution.md §8: "the sync never re-downloads a byte it already has ... If-None-Match
// writes"). Split out from fetchPart.ts so the handler's retry/fallback logic stays unit-testable
// with a fake writer, and this adapter is exercised against a mocked S3 client instead
// (T031's idempotency.test.ts).
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { S3ConditionalWriter } from "../handlers/fetchPart.js";

function isPreconditionFailed(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const statusCode = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata
    ?.httpStatusCode;
  return name === "PreconditionFailed" || statusCode === 412;
}

/** Writes `body` at `key` in `bucketName` only if the key doesn't exist yet (`If-None-Match: *`).
 * A `PreconditionFailed` (412) response — the key already exists — is the expected, non-error
 * shape of a re-run against an already-indexed manifestCid: it resolves to `written: false`
 * rather than throwing, so a retried/redriven Map item never crashes the state machine over an
 * idempotent no-op. Every other S3 error is re-thrown untouched. */
export function createS3PartWriter(
  bucketName: string,
  client: S3Client = new S3Client({}),
): S3ConditionalWriter {
  return {
    async putIfAbsent(key, body) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: body,
            IfNoneMatch: "*",
          }),
        );
        return { written: true };
      } catch (error) {
        if (isPreconditionFailed(error)) {
          return { written: false };
        }
        throw error;
      }
    },
  };
}
