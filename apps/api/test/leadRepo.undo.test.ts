// Undo of a just-created lead: ONE conditional transaction deletes LEAD + SIGNALS + EVT#0, or
// nothing. Conditions are DynamoDB's (via FakeLeadsTable), the reason is diagnosed afterwards.
import { describe, expect, it } from "vitest";
import { createDynamoLeadRepo } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

const CUTOFF = "2026-10-24T09:50:00.000Z"; // fixture lead was created at 10:00, so it is inside

function setup() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({
    tableName: "crm-leads",
    client: table.client(),
    sleep: async () => {},
  });
  return { table, repo };
}
const undo = (repo: ReturnType<typeof setup>["repo"], over: Record<string, unknown> = {}) =>
  repo.undoCreate({ leadKey: KEY, by: "rep-1", createdNotBefore: CUTOFF, ...over });

describe("leadRepo.undoCreate", () => {
  it("deletes LEAD, SIGNALS and EVT#0 in ONE transaction, releasing the key for a new create", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const before = table.transactions.length;
    expect(await undo(repo)).toEqual({ deleted: true });
    expect(table.transactions.length).toBe(before + 1);
    expect(table.items.size).toBe(0);
    await expect(repo.create(newLead({ leadId: "01JSECOND" }))).resolves.toMatchObject({
      leadId: "01JSECOND",
    });
  });

  it("puts every ownership/status/sequence/age condition on the LEAD delete itself", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await undo(repo, { leadId: "01JTESTLEAD0000000000000A" });
    const tx = table.transactions.at(-1) ?? [];
    expect(tx).toHaveLength(3);
    const cond = tx.find((t) => t.Delete?.Key.sk === "LEAD")?.Delete?.ConditionExpression;
    for (const term of [
      "assignee = :by",
      "#status = :new",
      "eventSequence = :zero",
      "createdAt >= :cutoff",
      "leadId = :leadId",
    ])
      expect(cond).toContain(term);
  });

  it("is idempotent: a second undo is NOT_FOUND and changes nothing", async () => {
    const { repo } = setup();
    await repo.create(newLead());
    await undo(repo);
    expect(await undo(repo)).toEqual({ deleted: false, reason: "NOT_FOUND" });
  });

  it("refuses another user's lead (NOT_OWNER) and writes nothing", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    expect(await undo(repo, { by: "rep-2" })).toEqual({ deleted: false, reason: "NOT_OWNER" });
    expect(table.items.size).toBe(3);
  });

  it("refuses once a note or status change added an event (CHANGED), keeping every item", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    await repo.addNote({ leadKey: KEY, by: "rep-1", at: "2026-10-24T10:01:00.000Z", text: "hi" });
    expect(await undo(repo)).toEqual({ deleted: false, reason: "CHANGED" });
    expect(table.items.size).toBe(4);
    await repo.updateStatus({ leadKey: KEY, by: "rep-1", at: "t", status: "contacted" });
    expect(await undo(repo)).toEqual({ deleted: false, reason: "CHANGED" });
  });

  it("refuses a lead older than the window (TOO_OLD)", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    expect(await undo(repo, { createdNotBefore: "2026-10-24T10:00:00.001Z" })).toEqual({
      deleted: false,
      reason: "TOO_OLD",
    });
    expect(table.items.size).toBe(3);
  });

  it("refuses a lead that is not new with no events (NOT_UNDOABLE)", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const lead = table.items.get(`${KEY}\u0000LEAD`);
    if (lead) lead.status = "won";
    expect(await undo(repo)).toEqual({ deleted: false, reason: "NOT_UNDOABLE" });
  });

  it("refuses a stale undo when the leadId differs (a re-created lead is not deleted)", async () => {
    const { table, repo } = setup();
    await repo.create(newLead({ leadId: "01JNEWER" }));
    expect(await undo(repo, { leadId: "01JOLDER" })).toEqual({
      deleted: false,
      reason: "NOT_FOUND",
    });
    expect(table.items.size).toBe(3);
  });

  it("an undo racing a note: exactly one wins, never a partial delete", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const [u, n] = await Promise.allSettled([
      undo(repo),
      repo.addNote({ leadKey: KEY, by: "rep-1", at: "t", text: "x" }),
    ]);
    const undone = u.status === "fulfilled" && u.value.deleted;
    if (undone) {
      expect(n.status).toBe("rejected"); // the note found no lead
      expect(table.items.size).toBe(0);
    } else {
      expect(table.items.size).toBe(4);
    }
  });
});
