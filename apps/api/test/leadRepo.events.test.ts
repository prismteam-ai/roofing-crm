// T008: updateStatus / addNote append a gapless EVT#{sequence} and update the LEAD projection;
// a write against a stale eventSequence is refused, never silently lost.
import { describe, expect, it } from "vitest";
import {
  createDynamoLeadRepo,
  LeadNotFoundError,
  LeadSequenceConflictError,
} from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

async function seeded() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
  await repo.create(newLead());
  return { table, repo };
}
const at = "2026-10-24T11:00:00.000Z";

describe("leadRepo events (T008)", () => {
  it("updateStatus appends EVT#1 and updates the LEAD projection in one transaction", async () => {
    const { table, repo } = await seeded();
    const updated = await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "rep-1", at });
    expect(updated).toMatchObject({ status: "contacted", eventSequence: 1 });
    expect(table.items.get(`${KEY}\u0000EVT#0000000001`)).toMatchObject({
      sequence: 1,
      kind: "statusChange",
      change: "status: new -> contacted",
    });
    expect(table.transactions.at(-1)).toHaveLength(2);
  });

  it("addNote appends the next EVT, leaving status unchanged; sequences are gapless", async () => {
    const { table, repo } = await seeded();
    await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "rep-1", at });
    const updated = await repo.addNote({ leadKey: KEY, text: "called owner", by: "rep-1", at });
    expect(updated).toMatchObject({ status: "contacted", eventSequence: 2 });
    const seqs = [...table.items.values()]
      .filter((i) => String(i.sk).startsWith("EVT#"))
      .map((i) => i.sequence)
      .sort();
    expect(seqs).toEqual([0, 1, 2]);
  });

  it("refuses a write against a stale eventSequence and writes nothing", async () => {
    const { table, repo } = await seeded();
    await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "rep-1", at });
    const before = table.items.size;
    await expect(
      repo.updateStatus({
        leadKey: KEY,
        status: "qualified",
        by: "rep-2",
        at,
        expectedSequence: 0,
      }),
    ).rejects.toBeInstanceOf(LeadSequenceConflictError);
    expect(table.items.size).toBe(before);
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({
      status: "contacted",
      eventSequence: 1,
    });
  });

  it("two concurrent writers from the same sequence: exactly one wins, none lost", async () => {
    const { table, repo } = await seeded();
    const results = await Promise.allSettled([
      repo.addNote({ leadKey: KEY, text: "a", by: "r", at, expectedSequence: 0 }),
      repo.addNote({ leadKey: KEY, text: "b", by: "r", at, expectedSequence: 0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({ eventSequence: 1 });
  });

  it("throws LeadNotFoundError for an unknown key", async () => {
    const { repo } = await seeded();
    await expect(
      repo.updateStatus({ leadKey: "48453:tcad:nope", status: "won", by: "r", at }),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
  });

  it("get returns lead, signals and events in sequence order; null when missing", async () => {
    const { repo } = await seeded();
    await repo.addNote({ leadKey: KEY, text: "hello", by: "rep-1", at });
    const detail = await repo.get(KEY);
    expect(detail?.lead.leadKey).toBe(KEY);
    expect(detail?.signals?.roofAgeYears).toBe(22);
    expect(detail?.events.map((e) => e.sequence)).toEqual([0, 1]);
    expect(await repo.get("48453:tcad:missing")).toBeNull();
  });

  it("listByAssignee / listByStatus use the sparse GSIs and exclude SIGNALS/EVT items", async () => {
    const { repo } = await seeded();
    await repo.create(
      newLead({
        leadKey: "48453:tcad:2",
        assignee: "rep-2",
        createdAt: "2026-10-24T10:05:00.000Z",
      }),
    );
    await repo.updateStatus({ leadKey: KEY, status: "won", by: "rep-1", at });
    expect((await repo.listByAssignee("rep-1")).map((l) => l.leadKey)).toEqual([KEY]);
    expect((await repo.listByStatus("new")).map((l) => l.leadKey)).toEqual(["48453:tcad:2"]);
    expect((await repo.listByStatus("won")).map((l) => l.leadKey)).toEqual([KEY]);
  });
});

describe("leadRepo assign", () => {
  it("moves the lead to the new assignee's list and appends an assignee event, in one transaction", async () => {
    const { table, repo } = await seeded();
    const updated = await repo.assign({ leadKey: KEY, assignee: "rep-2", by: "rep-2", at });
    expect(updated).toMatchObject({ assignee: "rep-2", eventSequence: 1 });
    expect(updated.lastActivity).toMatchObject({ kind: "assignee", at });
    expect(table.items.get(`${KEY}\u0000EVT#0000000001`)).toMatchObject({
      sequence: 1,
      kind: "assignee",
      by: "rep-2",
      change: "assignee: rep-1 -> rep-2",
    });
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({
      assignee: "rep-2",
      eventSequence: 1,
      lastActivityKind: "assignee",
    });
    expect(table.transactions.at(-1)).toHaveLength(2);
    expect(await repo.listByAssignee("rep-1")).toEqual([]);
    expect((await repo.listByAssignee("rep-2")).map((l) => l.leadKey)).toEqual([KEY]);
  });

  it("is a no-op when the lead is already theirs: no event, no transaction", async () => {
    const { table, repo } = await seeded();
    const before = table.transactions.length;
    const result = await repo.assign({ leadKey: KEY, assignee: "rep-1", by: "rep-1", at });
    expect(result).toMatchObject({ assignee: "rep-1", eventSequence: 0 });
    expect(table.transactions).toHaveLength(before);
    expect(table.items.has(`${KEY}\u0000EVT#0000000001`)).toBe(false);
  });

  it("refuses a stale expectedSequence and writes nothing", async () => {
    const { table, repo } = await seeded();
    await repo.addNote({ leadKey: KEY, text: "n", by: "rep-1", at });
    await expect(
      repo.assign({ leadKey: KEY, assignee: "rep-2", by: "rep-2", at, expectedSequence: 0 }),
    ).rejects.toBeInstanceOf(LeadSequenceConflictError);
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({
      assignee: "rep-1",
      eventSequence: 1,
    });
  });

  it("throws LeadNotFoundError for an unknown key", async () => {
    const { repo } = await seeded();
    await expect(
      repo.assign({ leadKey: "48453:tcad:nope", assignee: "rep-2", by: "rep-2", at }),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
  });
});
