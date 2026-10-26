// T008 (Phase 2 Foundational): the Plan step's output shape and digest-guard behavior, per
// contracts/sync-pipeline.md. T024 (Phase 3, espeon) implements apps/sync/handlers/plan.ts to
// make this pass — intentionally failing now (no handler exists yet).
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planHandler } from "../handlers/plan.js";
import { SAMPLE_MANIFEST_CID, serveSampleManifest } from "./fixtures/sampleManifest.js";

const s3Mock = mockClient(S3Client);

describe("Plan", () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
    // TD-6: the manifest's exact published bytes come from the committed fixture, not a gateway.
    serveSampleManifest();
  });

  afterEach(() => {
    delete process.env.CRM_INDEX_BUCKET_NAME;
    vi.unstubAllGlobals();
  });

  it("returns PlanResult's shape: manifestCid, bucket, manifestKey, parts, profiles, costEstimate", async () => {
    const result = await planHandler({
      manifestCidHint: SAMPLE_MANIFEST_CID,
    });
    expect(result).toMatchObject({
      manifestCid: expect.any(String),
      bucket: "crm-index-test",
      manifestKey: expect.any(String),
      // Found live: an earlier version of this shape dropped cid/sha256, so FetchPart fetched
      // literally "/ipfs/undefined" for every part. Asserted explicitly so a regression here
      // fails this test, not a live state machine run.
      parts: expect.arrayContaining([
        expect.objectContaining({
          path: expect.any(String),
          cid: expect.any(String),
          sha256: expect.any(String),
        }),
      ]),
      profiles: expect.any(Array),
      costEstimate: {
        predictedSpendUsd: expect.any(Number),
        predictedDocCount: expect.any(Number),
        predictedBytes: expect.any(Number),
      },
      coverageParcelsPublished: expect.any(Number),
      finishedAt: expect.any(String),
    });
  });

  it("holds (never throws uncaught) when a profiles[].sha256 mismatches the vendored copy's digest", async () => {
    const result = await planHandler({
      manifestCidHint: SAMPLE_MANIFEST_CID,
      // Test-only override: force the manifest's recorded digest off the vendored copy's real one.
      __testForceDigestMismatch: true,
    } as never);
    expect(result.status).toBe("Held");
    expect(result.heldReason).toBe("digest_mismatch");
  });
});
