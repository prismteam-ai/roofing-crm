import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, expect, test } from "vitest";
import { appRouter } from "../src/router.ts";
import type { Ctx } from "../src/trpc.ts";

const ddb = mockClient(DynamoDBDocumentClient);
const NOW = new Date("2026-11-12T10:00:00.000Z");
let logs: unknown[];
let metrics: string[];

const caller = (client: string | undefined) => {
  const ctx: Ctx = {
    db: DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: "eu-north-1" }),
    ),
    tableName: "leads",
    client,
    logger: {
      info: (m, e) => logs.push([m, e]),
      warn: (m, e) => logs.push([m, e]),
      error: (m, e) => logs.push([m, e]),
    },
    metrics: { addMetric: (n) => metrics.push(n) },
    now: () => NOW,
  };
  return appRouter.createCaller(ctx);
};
const conditionFailed = () =>
  new ConditionalCheckFailedException({ message: "failed", $metadata: {} });

beforeEach(() => {
  ddb.reset();
  logs = [];
  metrics = [];
});
afterEach(() => ddb.reset());

test("refuses a missing client (UNAUTHORIZED) and any client other than crm (FORBIDDEN)", async () => {
  await expect(caller(undefined).leads.list({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(caller("explorer").leads.list({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(ddb.calls()).toHaveLength(0);
});

test("create writes a conditional put with server timestamps and records LeadWritten", async () => {
  ddb.on(PutCommand).resolves({});
  const lead = await caller("crm").leads.create({
    parcel_id: "2317016013",
    notes: "Original roof.",
  });
  expect(lead).toEqual({
    parcel_id: "2317016013",
    status: "new",
    notes: "Original roof.",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  });
  const put = ddb.commandCalls(PutCommand)[0]!.args[0].input;
  expect(put.ConditionExpression).toBe("attribute_not_exists(parcel_id)");
  expect(put.TableName).toBe("leads");
  expect(metrics).toEqual(["LeadWritten"]);
  expect(JSON.stringify(logs)).not.toContain("Original roof.");
});

test("create from a permit stores source_permit on the item; without one the item has no such attribute", async () => {
  ddb.on(PutCommand).resolves({});
  const lead = await caller("crm").leads.create({
    parcel_id: "2317016013",
    source_permit: "16016-10000-24567",
  });
  expect(lead).toEqual({
    parcel_id: "2317016013",
    status: "new",
    notes: "",
    source_permit: "16016-10000-24567",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  });
  expect(ddb.commandCalls(PutCommand)[0]!.args[0].input.Item).toEqual(lead);
  await caller("crm").leads.create({ parcel_id: "2317016014" });
  const item = ddb.commandCalls(PutCommand)[1]!.args[0].input.Item!;
  expect(Object.keys(item).sort()).toEqual([
    "created_at",
    "notes",
    "parcel_id",
    "status",
    "updated_at",
  ]);
  // A malformed permit number is refused before any write.
  await expect(
    caller("crm").leads.create({
      parcel_id: "2317016015",
      source_permit: "16016-10000",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(ddb.commandCalls(PutCommand)).toHaveLength(2);
});

test("update never writes source_permit, even when a client sends it; the stored one comes back unchanged", async () => {
  ddb.on(UpdateCommand).resolves({
    Attributes: {
      parcel_id: "2317016013",
      status: "contacted",
      notes: "",
      source_permit: "16016-10000-24567",
      created_at: "a",
      updated_at: "b",
    },
  });
  const out = await caller("crm").leads.update({
    parcel_id: "2317016013",
    expected_updated_at: "2026-11-12T09:00:00.000Z",
    status: "contacted",
    // Not part of the update input: dropped before the write.
    ...({ source_permit: "99999-99999-99999" } as object),
  });
  const u = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
  expect(u.UpdateExpression).toBe("SET updated_at = :now, #status = :status");
  expect(JSON.stringify(u)).not.toContain("source_permit");
  expect(JSON.stringify(u)).not.toContain("99999-99999-99999");
  expect(out.source_permit).toBe("16016-10000-24567");
});

test("create on an existing lead is a CONFLICT, not a failure metric", async () => {
  ddb.on(PutCommand).rejects(conditionFailed());
  await expect(
    caller("crm").leads.create({ parcel_id: "2317016013" }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(metrics).toEqual([]);
});

test("notes with a parcel ID are rejected before any write", async () => {
  await expect(
    caller("crm").leads.create({
      parcel_id: "2317016013",
      notes: "see 2319005018",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(ddb.calls()).toHaveLength(0);
});

test("update is conditional on the last-seen updated_at; a stale one is a CONFLICT", async () => {
  ddb.on(UpdateCommand).resolvesOnce({
    Attributes: {
      parcel_id: "2317016013",
      status: "contacted",
      notes: "",
      created_at: "a",
      updated_at: "b",
    },
  });
  const seen = "2026-11-12T09:00:00.000Z";
  await caller("crm").leads.update({
    parcel_id: "2317016013",
    expected_updated_at: seen,
    status: "contacted",
  });
  const u = ddb.commandCalls(UpdateCommand)[0]!.args[0].input;
  expect(u.ConditionExpression).toBe(
    "attribute_exists(parcel_id) AND updated_at = :seen",
  );
  expect(u.ExpressionAttributeValues).toMatchObject({
    ":seen": seen,
    ":status": "contacted",
    ":now": NOW.toISOString(),
  });
  ddb.on(UpdateCommand).rejects(conditionFailed());
  await expect(
    caller("crm").leads.update({
      parcel_id: "2317016013",
      expected_updated_at: seen,
      notes: "x",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("delete is conditional; get and list read the table", async () => {
  ddb.on(DeleteCommand).resolves({});
  ddb.on(GetCommand).resolves({});
  ddb.on(ScanCommand).resolves({
    Items: [
      {
        parcel_id: "2317016013",
        status: "new",
        notes: "",
        created_at: "a",
        updated_at: "a",
      },
    ],
    LastEvaluatedKey: { parcel_id: "2317016013" },
  });
  const seen = "2026-11-12T09:00:00.000Z";
  expect(
    await caller("crm").leads.delete({
      parcel_id: "2317016013",
      expected_updated_at: seen,
    }),
  ).toEqual({
    parcel_id: "2317016013",
    deleted: true,
  });
  expect(
    ddb.commandCalls(DeleteCommand)[0]!.args[0].input.ConditionExpression,
  ).toBe("updated_at = :seen");
  expect(await caller("crm").leads.get({ parcel_id: "2317016013" })).toBeNull();
  const page = await caller("crm").leads.list({ limit: 1 });
  expect(page.items).toHaveLength(1);
  expect(page.next_cursor).toBe("2317016013");
});

test("an unexpected DynamoDB error records LeadWriteFailed and does not log the notes", async () => {
  ddb.on(PutCommand).rejects(new Error("boom"));
  await expect(
    caller("crm").leads.create({
      parcel_id: "2317016013",
      notes: "secret-ish text",
    }),
  ).rejects.toThrow();
  expect(metrics).toEqual(["LeadWriteFailed"]);
  expect(JSON.stringify(logs)).not.toContain("secret-ish text");
});
