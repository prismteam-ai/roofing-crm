// Shared S3 GetObject -> pipe-to-disk helper (CR-B-02 finding #7, E2 fixer): apps/sync/handlers/
// buildIndex.ts, apps/sync/handlers/validate.ts and apps/api/src/adapters/duckDbParquet.ts each
// re-implemented this exact helper independently, which is a drift risk on error handling. This
// is the one place it is defined now; every caller passes its own already-constructed S3Client
// (this module never constructs one itself, so it stays usable from both apps/sync's and
// apps/api's handlers without pulling in a second AWS SDK client configuration).
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";

/**
 * Downloads one S3 object and streams it to `destPath` on local disk. Throws if the object has
 * no body (the one failure mode every one of the three original copies checked for identically).
 */
export async function downloadS3ObjectToFile(
  s3: S3Client,
  bucket: string,
  key: string,
  destPath: string,
): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body;
  if (body === undefined) {
    throw new Error(`downloadS3ObjectToFile: S3 object ${key} has no body`);
  }
  await pipeline(body as NodeJS.ReadableStream, createWriteStream(destPath));
}
