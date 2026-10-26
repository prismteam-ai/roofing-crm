// CR finding 6b: `agent.confirmLead` may only confirm a tcadId the agent actually proposed in that
// `threadId`, to the rep who owns the thread. The per-thread record is one prefixed item in the
// existing `crm-agent-usage` table (data-model.md: the ConversationEventStore / review records may
// share that table; it has a `pk`-only key, so the thread record is one `THREAD#{threadId}` item
// rather than the event-per-SK layout), with a 7-day TTL — the ConversationEventStore's TTL.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createThreadStore,
  THREAD_TTL_SECONDS,
  ThreadOwnedByAnotherUserError,
} from "../../src/agent/threadStore.js";

const ddbMock = mockClient(DynamoDBDocumentClient);
const NOW = new Date("2026-10-24T10:00:00.000Z");

function makeStore() {
  return createThreadStore({
    tableName: "crm-agent-usage",
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    now: () => NOW,
  });
}

const PLAN = {
  intent: "propose_leads" as const,
  area: { kind: "place" as const, query: "Pflugerville", radiusMi: 5 },
  filters: { roofAgeMinYears: 15 },
  slotSources: {},
  unsupported: [],
};

describe("threadStore", () => {
  beforeEach(() => ddbMock.reset());

  it("records the turn's last QueryPlan and proposed tcadIds in one conditional UpdateItem with a 7-day TTL", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await makeStore().recordTurn("thread-1", "rep-1", {
      plan: PLAN,
      proposedTcadIds: ["0208011301", "0208011302"],
    });

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]?.args[0]?.input;
    expect(input?.TableName).toBe("crm-agent-usage");
    expect(input?.Key?.pk).toBe("THREAD#thread-1");
    expect(input?.ConditionExpression).toBe("attribute_not_exists(pk) OR actorId = :actor");
    expect(input?.UpdateExpression).toMatch(/ADD proposedTcadIds :proposed/);
    expect(input?.ExpressionAttributeValues?.[":actor"]).toBe("rep-1");
    expect(input?.ExpressionAttributeValues?.[":lastPlan"]).toEqual(PLAN);
    expect([...(input?.ExpressionAttributeValues?.[":proposed"] as Set<string>)].sort()).toEqual([
      "0208011301",
      "0208011302",
    ]);
    expect(THREAD_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(input?.ExpressionAttributeValues?.[":ttl"]).toBe(
      Math.floor(NOW.getTime() / 1000) + THREAD_TTL_SECONDS,
    );
  });

  it("does not ADD an empty set when nothing was proposed (DynamoDB rejects empty sets)", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await makeStore().recordTurn("thread-1", "rep-1", { plan: PLAN, proposedTcadIds: [] });

    const input = ddbMock.commandCalls(UpdateCommand)[0]?.args[0]?.input;
    expect(input?.UpdateExpression).not.toMatch(/ADD/);
    expect(input?.ExpressionAttributeValues).not.toHaveProperty(":proposed");
  });

  it("refuses to write into another user's thread", async () => {
    ddbMock
      .on(UpdateCommand)
      .rejects(Object.assign(new Error("failed"), { name: "ConditionalCheckFailedException" }));
    await expect(
      makeStore().recordTurn("thread-1", "rep-2", { plan: PLAN, proposedTcadIds: [] }),
    ).rejects.toBeInstanceOf(ThreadOwnedByAnotherUserError);
  });

  it("wasProposed: true only for a tcadId proposed in this thread to this actor (consistent read)", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "THREAD#thread-1",
        actorId: "rep-1",
        proposedTcadIds: new Set(["0208011301"]),
      },
    });
    const store = makeStore();

    expect(await store.wasProposed("thread-1", "rep-1", "0208011301")).toBe(true);
    expect(await store.wasProposed("thread-1", "rep-1", "9999999999")).toBe(false);
    expect(await store.wasProposed("thread-1", "rep-2", "0208011301")).toBe(false);
    const get = ddbMock.commandCalls(GetCommand)[0]?.args[0]?.input;
    expect(get?.Key?.pk).toBe("THREAD#thread-1");
    expect(get?.ConsistentRead).toBe(true);
  });

  it("wasProposed: false for an unknown thread", async () => {
    ddbMock.on(GetCommand).resolves({});
    expect(await makeStore().wasProposed("nope", "rep-1", "0208011301")).toBe(false);
  });

  // Finding 8 remainder (ash saved the plan; nothing read it): the plan step reads it back.
  it("lastPlan returns the thread's saved QueryPlan to its owner only, Zod-validated", async () => {
    ddbMock.on(GetCommand).resolves({ Item: { actorId: "rep-1", lastPlan: PLAN } });
    const store = makeStore();
    expect(await store.lastPlan("thread-1", "rep-1")).toEqual(PLAN);
    expect(await store.lastPlan("thread-1", "rep-2")).toBeUndefined();
    const get = ddbMock.commandCalls(GetCommand)[0]?.args[0]?.input;
    expect(get?.Key?.pk).toBe("THREAD#thread-1");
  });

  it("lastPlan is undefined for a new thread or a stored plan that no longer parses", async () => {
    ddbMock
      .on(GetCommand)
      .resolvesOnce({})
      .resolvesOnce({
        Item: { actorId: "rep-1", lastPlan: { intent: "nope" } },
      });
    const store = makeStore();
    expect(await store.lastPlan("thread-new", "rep-1")).toBeUndefined();
    expect(await store.lastPlan("thread-1", "rep-1")).toBeUndefined();
  });

  it("proposedAmong: one consistent read, returns only ids proposed in this thread to this actor", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { pk: "THREAD#thread-1", actorId: "rep-1", proposedTcadIds: new Set(["a", "b"]) },
    });
    const store = makeStore();

    expect([...(await store.proposedAmong("thread-1", "rep-1", ["a", "c", "b"]))].sort()).toEqual([
      "a",
      "b",
    ]);
    expect((await store.proposedAmong("thread-1", "rep-2", ["a"])).size).toBe(0);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(2);
    expect(ddbMock.commandCalls(GetCommand)[0]?.args[0]?.input.ConsistentRead).toBe(true);
  });

  it("proposedAmong: empty for an unknown thread", async () => {
    ddbMock.on(GetCommand).resolves({});
    expect((await makeStore().proposedAmong("nope", "rep-1", ["a"])).size).toBe(0);
  });
});
