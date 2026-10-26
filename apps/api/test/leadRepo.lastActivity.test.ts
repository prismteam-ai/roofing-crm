// Leads design alignment: the last activity is denormalised on the LEAD item inside the same
// conditional transaction that appends each event, so a list never reads events for new leads.
// Also: signalsFor (one BatchGetItem per 100 keys) and latestEvents (fallback for old leads).
import { describe, expect, it } from "vitest";
import {
  createDynamoLeadRepo,
  LeadAlreadyExistsError,
  LeadSequenceConflictError,
} from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

const T1 = "2026-10-24T11:00:00.000Z";
const T2 = "2026-10-24T12:00:00.000Z";
const leadItem = (t: FakeLeadsTable, key = KEY) => t.items.get(`${key}\u0000LEAD`);

function setup() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
  return { table, repo };
}

describe("leadRepo last activity (denormalised on the LEAD item)", () => {
  it("create writes created/at on the LEAD item in the same transaction", async () => {
    const { table, repo } = setup();
    const lead = await repo.create(newLead());
    expect(leadItem(table)).toMatchObject({
      lastActivityAt: "2026-10-24T10:00:00.000Z",
      lastActivityKind: "created",
      lastActivityExcerpt: "",
    });
    expect(table.transactions).toHaveLength(1);
    expect(lead.lastActivity).toEqual({ at: "2026-10-24T10:00:00.000Z", kind: "created" });
  });

  it("a status change updates it in the same two-item transaction as the event", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "rep-1", at: T1 });
    expect(leadItem(table)).toMatchObject({
      lastActivityAt: T1,
      lastActivityKind: "status",
      lastActivityExcerpt: "",
      eventSequence: 1,
    });
    expect(table.transactions.at(-1)).toHaveLength(2);
  });

  it("a note updates it with a trimmed excerpt of at most 120 characters", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.addNote({
      leadKey: KEY,
      text: "  called owner\n  and left a voicemail ",
      by: "r",
      at: T1,
    });
    expect(leadItem(table)).toMatchObject({
      lastActivityAt: T1,
      lastActivityKind: "note",
      lastActivityExcerpt: "called owner and left a voicemail",
    });
    await repo.addNote({ leadKey: KEY, text: "x".repeat(500), by: "r", at: T2 });
    const excerpt = String(leadItem(table)?.lastActivityExcerpt);
    expect(excerpt.length).toBeLessThanOrEqual(120);
    expect(excerpt.startsWith("xxx")).toBe(true);
    // a later status change clears the note excerpt so it cannot go stale
    await repo.updateStatus({ leadKey: KEY, status: "won", by: "r", at: T2 });
    expect(leadItem(table)).toMatchObject({ lastActivityKind: "status", lastActivityExcerpt: "" });
  });

  it("a stale-sequence write leaves the attributes untouched (409 semantics unchanged)", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "r", at: T1 });
    await expect(
      repo.addNote({ leadKey: KEY, text: "late", by: "r", at: T2, expectedSequence: 0 }),
    ).rejects.toBeInstanceOf(LeadSequenceConflictError);
    expect(leadItem(table)).toMatchObject({ lastActivityAt: T1, lastActivityKind: "status" });
  });

  it("a duplicate create is refused and leaves the original attributes", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.addNote({ leadKey: KEY, text: "n", by: "r", at: T1 });
    await expect(repo.create(newLead({ createdAt: T2 }))).rejects.toBeInstanceOf(
      LeadAlreadyExistsError,
    );
    expect(leadItem(table)).toMatchObject({ lastActivityAt: T1, lastActivityKind: "note" });
  });

  it("undoCreate still deletes an untouched fresh lead, and refuses one with activity", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const ok = await repo.undoCreate({
      leadKey: KEY,
      by: "rep-1",
      createdNotBefore: "2026-10-24T09:00:00.000Z",
    });
    expect(ok).toEqual({ deleted: true });
    expect(table.items.size).toBe(0);
    await repo.create(newLead());
    await repo.addNote({ leadKey: KEY, text: "n", by: "rep-1", at: T1 });
    expect(
      await repo.undoCreate({
        leadKey: KEY,
        by: "rep-1",
        createdNotBefore: "2026-10-24T09:00:00.000Z",
      }),
    ).toEqual({ deleted: false, reason: "CHANGED" });
  });

  it("listByAssignee returns lastActivity for new leads and leaves it absent for old ones", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.addNote({ leadKey: KEY, text: "hello", by: "rep-1", at: T1 });
    await repo.create(
      newLead({ leadKey: "48453:tcad:2", leadId: "L2", createdAt: "2026-10-23T10:00:00.000Z" }),
    );
    const old = table.items.get("48453:tcad:2\u0000LEAD");
    for (const k of ["lastActivityAt", "lastActivityKind", "lastActivityExcerpt"]) delete old?.[k];
    const rows = await repo.listByAssignee("rep-1");
    expect(rows.find((r) => r.leadKey === KEY)?.lastActivity).toEqual({
      at: T1,
      kind: "note",
      excerpt: "hello",
    });
    expect(rows.find((r) => r.leadKey === "48453:tcad:2")?.lastActivity).toBeUndefined();
  });
});

describe("leadRepo.signalsFor", () => {
  it("reads the SIGNALS items of many leads with one BatchGetItem and skips missing ones", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.create(newLead({ leadKey: "48453:tcad:2", leadId: "L2" }));
    const out = await repo.signalsFor([KEY, "48453:tcad:2", "48453:tcad:9", KEY]);
    expect(table.batchGets).toHaveLength(1);
    expect(table.batchGets[0]?.["crm-leads"].Keys).toEqual([
      { pk: KEY, sk: "SIGNALS" },
      { pk: "48453:tcad:2", sk: "SIGNALS" },
      { pk: "48453:tcad:9", sk: "SIGNALS" },
    ]);
    expect([...out.keys()].sort()).toEqual([KEY, "48453:tcad:2"].sort());
    expect(out.get(KEY)).toMatchObject({ roofAgeYears: 22, openPermitId: "BP-1", openDays: 2000 });
  });

  it("chunks at 100 keys per call", async () => {
    const { table, repo } = setup();
    await repo.signalsFor(Array.from({ length: 230 }, (_, i) => `48453:tcad:${String(i)}`));
    expect(table.batchGets.map((b) => b["crm-leads"].Keys.length)).toEqual([100, 100, 30]);
  });
});

describe("leadRepo.latestEvents", () => {
  it("returns each lead's newest event with a descending limit-1 query", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.updateStatus({ leadKey: KEY, status: "contacted", by: "r", at: T1 });
    await repo.addNote({ leadKey: KEY, text: "hello", by: "r", at: T2 });
    await repo.create(newLead({ leadKey: "48453:tcad:2", leadId: "L2" }));
    table.queries.length = 0;
    const out = await repo.latestEvents([KEY, "48453:tcad:2"]);
    expect(out.get(KEY)).toMatchObject({ sequence: 2, kind: "note", at: T2 });
    expect(out.get("48453:tcad:2")).toMatchObject({ sequence: 0, kind: "create" });
    expect(table.queries).toHaveLength(2);
    for (const q of table.queries) {
      expect(q.ScanIndexForward).toBe(false);
      expect(q.Limit).toBe(1);
    }
  });
});
