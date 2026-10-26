// B-07: leadRepo edge paths: writes on a missing lead, caller-supplied expectedSequence, errors
// that are not conflicts propagating unchanged, paged reads, list cap, and env construction.
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDynamoLeadRepo,
  createDynamoLeadRepoFromEnv,
  LeadNotFoundError,
  LeadSequenceConflictError,
  MAX_CONFLICT_ATTEMPTS,
  MAX_LISTED_LEADS,
} from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

const noSleep = (): Promise<void> => Promise.resolve();

function setup() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({
    tableName: "crm-leads",
    client: table.client(),
    sleep: noSleep,
  });
  return { table, repo };
}

/** A client that forces every query to return at most `limit` rows per page. */
function pagedClient(table: FakeLeadsTable, limit: number): DynamoDBDocumentClient {
  const real = table.client();
  return {
    send: (cmd: unknown) => {
      if (cmd instanceof QueryCommand) cmd.input.Limit = limit;
      return (real as unknown as { send(c: unknown): Promise<unknown> }).send(cmd);
    },
  } as unknown as DynamoDBDocumentClient;
}

/** A client whose transactional writes always fail with `error`. */
function failingWrites(table: FakeLeadsTable, error: unknown) {
  const real = table.client();
  const calls = { count: 0 };
  const client = {
    send: (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "TransactWriteCommand") {
        calls.count += 1;
        return Promise.reject(error);
      }
      return (real as unknown as { send(c: unknown): Promise<unknown> }).send(cmd);
    },
  } as unknown as DynamoDBDocumentClient;
  return { client, calls };
}

const cancelled = (...codes: string[]): Error =>
  Object.assign(new Error("cancelled"), {
    name: "TransactionCanceledException",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

describe("leadRepo writes on a missing lead", () => {
  it("updateStatus and addNote throw LeadNotFoundError and write nothing", async () => {
    const { table, repo } = setup();
    const at = "2026-10-24T11:00:00.000Z";
    await expect(
      repo.updateStatus({ leadKey: "48453:tcad:none", by: "rep-1", at, status: "won" }),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
    await expect(
      repo.addNote({ leadKey: "48453:tcad:none", by: "rep-1", at, text: "hi" }),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
    expect(table.transactions).toHaveLength(0);
    expect(table.items.size).toBe(0);
  });
});

describe("leadRepo expectedSequence", () => {
  it("a stale expectedSequence is refused as a sequence conflict and nothing is written", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const before = table.transactions.length;
    await expect(
      repo.updateStatus({
        leadKey: KEY,
        by: "rep-1",
        at: "2026-10-24T11:00:00.000Z",
        status: "won",
        expectedSequence: 5,
      }),
    ).rejects.toBeInstanceOf(LeadSequenceConflictError);
    expect(table.transactions).toHaveLength(before);
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({ status: "new", eventSequence: 0 });
  });

  it("a matching expectedSequence appends EVT#n+1 and returns the new status and sequence", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const updated = await repo.updateStatus({
      leadKey: KEY,
      by: "rep-2",
      at: "2026-10-24T11:00:00.000Z",
      status: "contacted",
      expectedSequence: 0,
    });
    expect(updated).toMatchObject({ status: "contacted", eventSequence: 1 });
    expect(table.items.get(`${KEY}\u0000EVT#0000000001`)).toMatchObject({
      kind: "statusChange",
      by: "rep-2",
      change: "status: new -> contacted",
    });
  });

  it("a note keeps the current status and stores the text as JSON", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const updated = await repo.addNote({
      leadKey: KEY,
      by: "rep-1",
      at: "2026-10-24T11:00:00.000Z",
      text: 'said "call" & left\nmsg',
    });
    expect(updated).toMatchObject({ status: "new", eventSequence: 1 });
    expect(table.items.get(`${KEY}\u0000EVT#0000000001`)?.change).toBe(
      `note: ${JSON.stringify('said "call" & left\nmsg')}`,
    );
  });
});

describe("leadRepo errors that are not conflicts", () => {
  it.each([
    ["a plain error", new Error("throttled")],
    ["a non-Error rejection", "boom"],
    [
      "a cancellation without reasons",
      Object.assign(new Error("x"), { name: "TransactionCanceledException" }),
    ],
    ["a cancellation for another reason", cancelled("ValidationError", "None")],
  ])("%s propagates unchanged from create, updateStatus and addNote", async (_n, error) => {
    const table = new FakeLeadsTable();
    const seed = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    await seed.create(newLead());
    const { client, calls } = failingWrites(table, error);
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client, sleep: noSleep });
    const at = "2026-10-24T11:00:00.000Z";
    await expect(repo.create(newLead({ leadKey: "48453:tcad:2" }))).rejects.toBe(error);
    await expect(repo.updateStatus({ leadKey: KEY, by: "r", at, status: "won" })).rejects.toBe(
      error,
    );
    await expect(repo.addNote({ leadKey: KEY, by: "r", at, text: "x" })).rejects.toBe(error);
    expect(calls.count).toBe(3); // no retry for anything but TransactionConflict
  });

  it("gives up after MAX_CONFLICT_ATTEMPTS persistent TransactionConflicts", async () => {
    const table = new FakeLeadsTable();
    const error = cancelled("TransactionConflict", "None");
    const { client, calls } = failingWrites(table, error);
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client, sleep: noSleep });
    await expect(repo.create(newLead())).rejects.toBe(error);
    expect(calls.count).toBe(MAX_CONFLICT_ATTEMPTS);
  });

  it("a mixed conflict + failed condition is the real outcome, not a retry", async () => {
    const table = new FakeLeadsTable();
    const { client, calls } = failingWrites(
      table,
      cancelled("TransactionConflict", "ConditionalCheckFailed"),
    );
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client, sleep: noSleep });
    await expect(repo.create(newLead())).rejects.toMatchObject({ name: "LeadAlreadyExistsError" });
    expect(calls.count).toBe(1);
  });
});

describe("leadRepo.get", () => {
  it("returns null for an unknown lead", async () => {
    const { repo } = setup();
    await expect(repo.get("48453:tcad:none")).resolves.toBeNull();
  });

  it("returns the lead, its signals and events in sequence order, across query pages", async () => {
    const table = new FakeLeadsTable();
    const plain = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    await plain.create(newLead());
    for (const text of ["a", "b", "c"]) {
      await plain.addNote({ leadKey: KEY, by: "rep-1", at: "2026-10-24T11:00:00.000Z", text });
    }
    const paged = createDynamoLeadRepo({ tableName: "crm-leads", client: pagedClient(table, 2) });
    const detail = await paged.get(KEY);
    expect(detail?.lead).toMatchObject({ leadKey: KEY, eventSequence: 3 });
    expect(detail?.signals).toMatchObject({ roofAgeYears: 22, openPermitId: "BP-1" });
    expect(detail?.events.map((e) => e.sequence)).toEqual([0, 1, 2, 3]);
    expect(detail?.events.map((e) => e.kind)).toEqual(["create", "note", "note", "note"]);
  });

  it("reports signals as undefined when the SIGNALS item is absent", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    table.items.delete(`${KEY}\u0000SIGNALS`);
    const detail = await repo.get(KEY);
    expect(detail?.signals).toBeUndefined();
    expect(detail?.events).toHaveLength(1);
  });
});

describe("leadRepo list reads", () => {
  it("listByAssignee pages through the index and returns newest first", async () => {
    const table = new FakeLeadsTable();
    const plain = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    for (let i = 1; i <= 5; i++) {
      await plain.create(
        newLead({
          leadKey: `48453:tcad:${i}`,
          leadId: `01JLEAD${i}`,
          createdAt: `2026-10-2${i}T10:00:00.000Z`,
        }),
      );
    }
    await plain.create(newLead({ leadKey: "48453:tcad:other", assignee: "rep-9" }));
    const paged = createDynamoLeadRepo({ tableName: "crm-leads", client: pagedClient(table, 2) });
    const leads = await paged.listByAssignee("rep-1");
    expect(leads.map((l) => l.leadKey)).toEqual([5, 4, 3, 2, 1].map((i) => `48453:tcad:${i}`));
  });

  it("listByStatus returns only leads in that status", async () => {
    const { repo } = setup();
    await repo.create(newLead({ leadKey: "48453:tcad:1" }));
    await repo.create(newLead({ leadKey: "48453:tcad:2" }));
    await repo.updateStatus({
      leadKey: "48453:tcad:2",
      by: "rep-1",
      at: "2026-10-24T11:00:00.000Z",
      status: "won",
    });
    expect((await repo.listByStatus("won")).map((l) => l.leadKey)).toEqual(["48453:tcad:2"]);
    expect((await repo.listByStatus("new")).map((l) => l.leadKey)).toEqual(["48453:tcad:1"]);
    expect(await repo.listByStatus("lost")).toEqual([]);
  });

  it("never returns more than MAX_LISTED_LEADS", async () => {
    const { repo } = setup();
    for (let i = 0; i < MAX_LISTED_LEADS + 1; i++) {
      await repo.create(newLead({ leadKey: `48453:tcad:${i}`, leadId: `01J${i}` }));
    }
    expect(await repo.listByAssignee("rep-1")).toHaveLength(MAX_LISTED_LEADS);
  });
});

describe("createDynamoLeadRepoFromEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to build without CRM_LEADS_TABLE_NAME", () => {
    vi.stubEnv("CRM_LEADS_TABLE_NAME", "");
    expect(() => createDynamoLeadRepoFromEnv()).toThrow("CRM_LEADS_TABLE_NAME is not set");
  });

  it("builds a repo when the table name is set, with or without an explicit region", () => {
    vi.stubEnv("CRM_LEADS_TABLE_NAME", "crm-leads");
    for (const repo of [createDynamoLeadRepoFromEnv(), createDynamoLeadRepoFromEnv("eu-north-1")]) {
      expect(typeof repo.create).toBe("function");
      expect(typeof repo.get).toBe("function");
    }
  });
});
