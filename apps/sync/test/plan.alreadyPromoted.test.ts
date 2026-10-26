// B-09 auto-sync on deploy: CrmSync starts one sync execution whenever `DATA_MANIFEST_CID`
// changes. That execution (and any re-delivery of it, e.g. a CloudFormation rollback re-running
// the start call with the previous CID) must be idempotent: when the resolved manifestCid is
// already `META#index.current`, Plan ends the run as `AlreadyPromoted` before fetching anything —
// no gateway fetch, no S3 write, no FetchPart/BuildIndex/Validate work. Promote's own
// conditional write (promote.test.ts) stays the second guard.
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planHandler } from "../handlers/plan.js";

const RUN_2_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
const RUN_1_MANIFEST_CID = "bafkreiddef7ssybq6m4wpmah7adposaxbiawaxcmqndzk36wyhd7k4h6gu";

const s3Mock = mockClient(S3Client);
const ssmMock = mockClient(SSMClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

/** No test here may reach a gateway: a fetch means Plan went on past the idempotency check. */
const fetchSpy = vi.fn(async () => {
  throw new Error("network disabled in this test");
});

describe("Plan: already-promoted manifest is a no-op (auto-sync idempotency)", () => {
  beforeEach(() => {
    s3Mock.reset();
    ssmMock.reset();
    ddbMock.reset();
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
    s3Mock.on(PutObjectCommand).resolves({});
    process.env.CRM_INDEX_BUCKET_NAME = "crm-index-test";
    process.env.CRM_LEADS_TABLE_NAME = "crm-leads";
    process.env.MANIFEST_CID_SSM_PARAM_NAME = "/crm/sync/data-manifest-cid";
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: RUN_2_MANIFEST_CID } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CRM_INDEX_BUCKET_NAME;
    delete process.env.CRM_LEADS_TABLE_NAME;
    delete process.env.MANIFEST_CID_SSM_PARAM_NAME;
  });

  it("returns AlreadyPromoted, with no fetch and no S3 write, when META#index.current is this CID", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { pk: "META#index", sk: "META", current: RUN_2_MANIFEST_CID } });

    const result = await planHandler({ manifestCidHint: RUN_2_MANIFEST_CID });

    expect(result).toEqual({ status: "AlreadyPromoted", manifestCid: RUN_2_MANIFEST_CID });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
    const [get] = ddbMock.commandCalls(GetCommand);
    expect(get?.args[0].input).toEqual({
      TableName: "crm-leads",
      Key: { pk: "META#index", sk: "META" },
    });
  });

  it("makes every redeploy's start of an unchanged, already-served CID free: no fetch, no write", async () => {
    // CrmSync now starts one execution per deploy ({manifestCid}-{deployNonce} names), always with
    // this same input (infra/lib/crm-sync-stack.ts's startSyncCall).
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { pk: "META#index", sk: "META", current: RUN_2_MANIFEST_CID } });
    const deployInput = { manifestCidHint: RUN_2_MANIFEST_CID };

    for (let deploy = 0; deploy < 3; deploy += 1) {
      await expect(planHandler(deployInput)).resolves.toEqual({
        status: "AlreadyPromoted",
        manifestCid: RUN_2_MANIFEST_CID,
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("proceeds to fetch the manifest when a different CID is promoted (a real switch)", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { pk: "META#index", sk: "META", current: RUN_1_MANIFEST_CID } });

    await expect(planHandler({})).rejects.toThrow(/every gateway failed/);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("proceeds on a first-ever run (no META#index item)", async () => {
    ddbMock.on(GetCommand).resolves({});

    await expect(planHandler({})).rejects.toThrow(/every gateway failed/);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("rebuilds anyway when the operator passes forceRebuild: true", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { current: RUN_2_MANIFEST_CID } });

    await expect(planHandler({ forceRebuild: true })).rejects.toThrow(/every gateway failed/);
    expect(fetchSpy).toHaveBeenCalled();
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  it("does not short-circuit when the pointer is unreadable — Promote's conditional write still guards", async () => {
    ddbMock.on(GetCommand).rejects(new Error("AccessDenied"));

    await expect(planHandler({})).rejects.toThrow(/every gateway failed/);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("skips the check entirely when no leads table is configured (local runs)", async () => {
    delete process.env.CRM_LEADS_TABLE_NAME;

    await expect(planHandler({})).rejects.toThrow(/every gateway failed/);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });
});
