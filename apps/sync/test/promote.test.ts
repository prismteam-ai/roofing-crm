// T021 (Phase 3, INDEX, US1+US4): Promote only flips META#index.current for a Validated run
// (never Held or partial), via a DynamoDB conditional write guarded on the previous pointer
// value; a second Promote call for an already-promoted manifestCid is a no-op, not a duplicate
// write. Written first, shown failing (no handler exists yet).
import { DynamoDBDocumentClient, type UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { createObservability } from "@crm/observability";
import { beforeEach, describe, expect, it } from "vitest";
import { promoteWithClient, type PromoteInput } from "../handlers/promote.js";
import { extractPreviousPromotedPropertyCount } from "../handlers/validate.js";
import type { IndexMeta } from "@crm/index-schema";

const ddbMock = mockClient(DynamoDBDocumentClient);
const obs = createObservability("Promote-test");

const MANIFEST_CID = "baguqeeramjzy4a3oqe5sldka4hdbbm65xkbjh2yaxkb2j4dtqqkctodfxayq";

function validatedMeta(overrides: Partial<IndexMeta> = {}): IndexMeta {
  return {
    manifestCid: MANIFEST_CID,
    status: "Validated",
    propertyCount: 14,
    permitCount: 35,
    reconcileDiff: 0,
    heldReason: null,
    finishedAt: "2026-10-21T10:40:04.525Z",
    ...overrides,
  };
}

function input(overrides: Partial<PromoteInput> = {}): PromoteInput {
  return {
    indexMeta: validatedMeta(),
    tableName: "crm-leads",
    planStartedAt: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

describe("Promote", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("flips META#index.current via a conditional write when the run is Validated", async () => {
    ddbMock.onAnyCommand().resolves({});

    const result = await promoteWithClient(
      input(),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );

    expect(result.promoted).toBe(true);
    expect(result.manifestCid).toBe(MANIFEST_CID);
    expect(result.syncDurationMs).toBeGreaterThanOrEqual(0);
    expect(ddbMock.calls()).toHaveLength(1);
    const sentCommand = ddbMock.calls()[0]?.args[0];
    expect(sentCommand?.input).toMatchObject({
      ConditionExpression: expect.stringContaining("current"),
    });
  });

  it("addresses the pointer with the pk+sk key crm-leads actually has (found live on the first real table)", async () => {
    ddbMock.onAnyCommand().resolves({});

    await promoteWithClient(input(), DynamoDBDocumentClient.from(new DynamoDBClient({})), obs);

    expect(ddbMock.calls()[0]?.args[0].input).toMatchObject({
      Key: { pk: "META#index", sk: "META" },
    });
  });

  it("does not read #current unguarded: the first-ever promotion has no item to copy it from (found live)", async () => {
    ddbMock.onAnyCommand().resolves({});

    await promoteWithClient(input(), DynamoDBDocumentClient.from(new DynamoDBClient({})), obs);

    const sent = ddbMock.calls()[0]?.args[0].input as {
      UpdateExpression: string;
      ExpressionAttributeValues: Record<string, unknown>;
    };
    expect(sent.UpdateExpression).toContain("#previous = if_not_exists(#current, :noPrevious)");
    expect(sent.ExpressionAttributeValues[":noPrevious"]).toBeNull();
  });

  it("never flips the pointer for a Held run", async () => {
    ddbMock.onAnyCommand().resolves({});

    await expect(
      promoteWithClient(
        input({
          indexMeta: validatedMeta({
            status: "Held",
            heldReason: "reconcile_diff_exceeds_tolerance",
          }),
        }),
        DynamoDBDocumentClient.from(new DynamoDBClient({})),
        obs,
      ),
    ).rejects.toThrow(/non-Validated/);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it("persists propertyCount/permitCount/promotedAt onto META#index, not just #current/#previous (CR-B-02 finding #1)", async () => {
    ddbMock.onAnyCommand().resolves({});

    await promoteWithClient(
      input({ indexMeta: validatedMeta({ propertyCount: 14, permitCount: 35 }) }),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );

    const sentCommand = ddbMock.calls()[0]?.args[0];
    expect(sentCommand?.input).toMatchObject({
      UpdateExpression: expect.stringContaining("propertyCount = :propertyCount"),
      ExpressionAttributeValues: expect.objectContaining({
        ":propertyCount": 14,
        ":permitCount": 35,
        ":promotedAt": expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    });
  });

  it("a second Promote run's Validate sees the real prior count — not undefined/null (CR-B-02 finding #1, end to end)", async () => {
    // Run 1: Promote a run with 14 properties. Capture exactly what DynamoDB would now hold on
    // the META#index item — the whole point of this test is to prove Validate's own read path
    // (extractPreviousPromotedPropertyCount, the exact function apps/sync/handlers/validate.ts
    // calls) sees *this* write, not a re-implemented assumption about what Promote wrote.
    ddbMock.onAnyCommand().resolves({});
    await promoteWithClient(
      input({ indexMeta: validatedMeta({ propertyCount: 14, permitCount: 35 }) }),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );
    const sentInput = ddbMock.calls()[0]?.args[0].input as UpdateCommandInput;
    const run1Values = sentInput.ExpressionAttributeValues as Record<string, unknown>;

    // Simulate DynamoDB actually having persisted that write: a GetCommand against META#index
    // now returns those same values back (what Validate's real GetCommand would see on Run 2).
    const persistedItem = {
      pk: "META#index",
      current: run1Values?.[":next"],
      propertyCount: run1Values?.[":propertyCount"],
      permitCount: run1Values?.[":permitCount"],
      promotedAt: run1Values?.[":promotedAt"],
    };

    const previousPromotedPropertyCount = extractPreviousPromotedPropertyCount(persistedItem);

    // Before this fix, Promote never wrote propertyCount at all, so this would be `null` — the
    // >5%-row-drop-hold check (constitution §10/SC-006) could never fire. It must now be the
    // real prior count.
    expect(previousPromotedPropertyCount).toBe(14);
  });

  it("a second Promote call for an already-promoted manifestCid is a no-op, not a duplicate write", async () => {
    ddbMock
      .onAnyCommand()
      .rejects(new ConditionalCheckFailedException({ message: "already promoted", $metadata: {} }));

    const result = await promoteWithClient(
      input(),
      DynamoDBDocumentClient.from(new DynamoDBClient({})),
      obs,
    );

    expect(result.promoted).toBe(false);
    expect(result.syncDurationMs).toBeNull();
  });
});
