// T031: the S3 write key is `sha256(manifestCid + partPath)` and a `PutObject` with
// `If-None-Match: *` against an existing key is a no-op (zero new objects), not an overwrite or
// error (AC-4/FR-004). T032 implements apps/sync/src/s3PartWriter.ts to make this pass —
// intentionally failing now (no module exists yet).
import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contentAddressedKey } from "../handlers/fetchPart.js";
import { createS3PartWriter } from "../src/s3PartWriter.js";

const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const PART_PATH = "v_property/part-000.parquet";

describe("content-addressed idempotency key", () => {
  it("is sha256(manifestCid + partPath)", () => {
    const expected = createHash("sha256")
      .update(MANIFEST_CID + PART_PATH)
      .digest("hex");
    expect(contentAddressedKey(MANIFEST_CID, PART_PATH)).toBe(expected);
  });

  it("is stable across repeated calls with the same inputs (a re-run resolves to the same key)", () => {
    expect(contentAddressedKey(MANIFEST_CID, PART_PATH)).toBe(
      contentAddressedKey(MANIFEST_CID, PART_PATH),
    );
  });
});

describe("S3 conditional writer (If-None-Match)", () => {
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
  });

  afterEach(() => {
    s3Mock.restore();
  });

  it("writes a new key and reports written: true", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const writer = createS3PartWriter("crm-index", new S3Client({ region: "eu-north-1" }));

    const result = await writer.putIfAbsent("abc123", Buffer.from("bytes"));

    expect(result).toEqual({ written: true });
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input.IfNoneMatch).toBe("*");
    expect(calls[0]?.args[0].input.Key).toBe("abc123");
  });

  it("is a no-op (written: false, no throw) when the key already exists — zero new S3 objects", async () => {
    const preconditionFailed = Object.assign(
      new Error("At least one of the pre-conditions you specified did not hold"),
      {
        name: "PreconditionFailed",
        $metadata: { httpStatusCode: 412 },
      },
    );
    s3Mock.on(PutObjectCommand).rejects(preconditionFailed);
    const writer = createS3PartWriter("crm-index", new S3Client({ region: "eu-north-1" }));

    await expect(writer.putIfAbsent("already-there", Buffer.from("bytes"))).resolves.toEqual({
      written: false,
    });
    // The underlying call still happens (that's how S3 enforces the condition), but no second,
    // overwriting PutObject is ever attempted by the writer itself.
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
  });

  it("re-throws any other S3 error (not swallowed as a false idempotency signal)", async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error("AccessDenied"));
    const writer = createS3PartWriter("crm-index", new S3Client({ region: "eu-north-1" }));

    await expect(writer.putIfAbsent("some-key", Buffer.from("bytes"))).rejects.toThrow(
      "AccessDenied",
    );
  });
});
