// CR-B-02 finding #7 (E2 fixer): one shared S3 GetObject -> pipe-to-disk helper, replacing the
// three independent copies in apps/sync/handlers/buildIndex.ts, apps/sync/handlers/validate.ts
// and apps/api/src/adapters/duckDbParquet.ts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadS3ObjectToFile } from "../src/s3.js";

const s3Mock = mockClient(S3Client);

describe("downloadS3ObjectToFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    s3Mock.reset();
    tmpDir = mkdtempSync(join(tmpdir(), "crm-observability-s3-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("streams the object's body to the destination path", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: Readable.from([Buffer.from("hello crm")]) as unknown as NonNullable<
        GetObjectCommandOutput["Body"]
      >,
    });
    const dest = join(tmpDir, "out.bin");

    await downloadS3ObjectToFile(new S3Client({}), "crm-index", "some/key", dest);

    expect(readFileSync(dest, "utf8")).toBe("hello crm");
  });

  it("throws when the object has no body, rather than writing an empty/corrupt file", async () => {
    s3Mock.on(GetObjectCommand).resolves({});
    const dest = join(tmpDir, "missing.bin");

    await expect(
      downloadS3ObjectToFile(new S3Client({}), "crm-index", "missing/key", dest),
    ).rejects.toThrow(/has no body/);
  });
});
