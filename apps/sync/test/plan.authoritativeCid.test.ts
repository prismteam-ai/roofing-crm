// Phase 6 convergence T049 (HIGH): Plan previously resolved the manifestCid only from an
// unverified `input.manifestCidHint`, with no authoritative resolution path — contradicting
// plan.md/research.md's decision ("A pinned manifest CID in SSM is the authority") and
// contracts/sync-pipeline.md's Input comment ("from EventBridge discovery, or a pinned SSM
// value"). This asserts the authoritative source (an SSM-pinned parameter, or a verified
// `runs/index.json` hint in this run's own S3 bucket) is resolved and takes priority over a
// disagreeing `manifestCidHint`, which is otherwise kept as the fallback when neither
// authoritative source is configured. Written first, shown failing (plan.ts has no such
// resolution yet).
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planHandler } from "../handlers/plan.js";
import { SAMPLE_MANIFEST_CID, serveSampleManifest } from "./fixtures/sampleManifest.js";
// Any well-formed-looking but different CIDv1 string: never fetched in the SSM/runs-index cases
// below, since the authoritative source must be resolved and used before any network fetch.
const DISAGREEING_HINT_CID = "bafkreicccccccccccccccccccccccccccccccccccccccccccccccccc";

const s3Mock = mockClient(S3Client);
const ssmMock = mockClient(SSMClient);

describe("Plan: authoritative manifestCid resolution (Phase 6 convergence T049)", () => {
  beforeEach(() => {
    s3Mock.reset();
    ssmMock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
    // TD-6: the manifest's exact published bytes come from the committed fixture, not a gateway.
    serveSampleManifest();
  });

  afterEach(() => {
    delete process.env.CRM_INDEX_BUCKET_NAME;
    vi.unstubAllGlobals();
    // Literal key (not the handler's own env-var-name constant) so this stays a statically
    // analyzable property delete, per the repo's `@typescript-eslint/no-dynamic-delete` rule.
    delete process.env.MANIFEST_CID_SSM_PARAM_NAME;
  });

  it("resolves the authoritative manifestCid from the pinned SSM parameter, overriding a disagreeing input hint", async () => {
    process.env.MANIFEST_CID_SSM_PARAM_NAME = "/crm/data-manifest-cid";
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: SAMPLE_MANIFEST_CID } });
    // Never consulted: the SSM parameter is authoritative, so runs/index.json is never read.
    s3Mock.on(GetObjectCommand).rejects(new Error("runs/index.json must not be read here"));

    const result = await planHandler({ manifestCidHint: DISAGREEING_HINT_CID } as never);

    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
    expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
  });

  it("resolves the authoritative manifestCid from a verified runs/index.json hint when no SSM parameter is configured", async () => {
    delete process.env.MANIFEST_CID_SSM_PARAM_NAME;
    s3Mock.on(GetObjectCommand, { Key: "runs/index.json" }).resolves({
      Body: Readable.from([
        Buffer.from(
          JSON.stringify({
            schema: "oracle-travis-runs-index.v1",
            runs: [
              {
                runId: "run-1",
                manifestCid: SAMPLE_MANIFEST_CID,
                finishedAt: "2026-10-01T00:00:00Z",
              },
            ],
          }),
        ),
      ]),
    } as never);

    const result = await planHandler({ manifestCidHint: DISAGREEING_HINT_CID } as never);

    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
  });

  it("falls back to the input manifestCidHint when neither an SSM parameter nor a runs/index.json hint is available", async () => {
    delete process.env.MANIFEST_CID_SSM_PARAM_NAME;
    s3Mock.on(GetObjectCommand).rejects(new Error("NoSuchKey: no runs/index.json in this bucket"));

    const result = await planHandler({ manifestCidHint: SAMPLE_MANIFEST_CID });

    expect(result).toHaveProperty("manifestCid", SAMPLE_MANIFEST_CID);
  });
});
