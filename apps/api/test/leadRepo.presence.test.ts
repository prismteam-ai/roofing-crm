// presence: BatchGetItem on lead keys, returning only key, leadId and status for any assignee.
import { describe, expect, it } from "vitest";
import { createDynamoLeadRepo } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { newLead } from "./support/leadFixtures.js";

describe("leadRepo.presence", () => {
  it("returns present leads of every assignee, no owner or notes, and skips absent keys", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    await repo.create(newLead());
    await repo.create(newLead({ leadKey: "48453:tcad:2", leadId: "L2", assignee: "rep-2" }));
    const rows = await repo.presence(["48453:tcad:0208011301", "48453:tcad:2", "48453:tcad:9"]);
    expect(rows).toEqual([
      { leadKey: "48453:tcad:0208011301", leadId: "01JTESTLEAD0000000000000A", status: "new" },
      { leadKey: "48453:tcad:2", leadId: "L2", status: "new" },
    ]);
    const req = table.batchGets[0]?.["crm-leads"];
    expect(req.ProjectionExpression).toBe("pk, leadId, #status");
  });

  it("chunks at 100 keys per BatchGetItem and de-duplicates", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    const keys = Array.from({ length: 230 }, (_, i) => `48453:tcad:${String(i)}`);
    await repo.presence([...keys, ...keys]);
    expect(table.batchGets.map((b) => b["crm-leads"].Keys.length)).toEqual([100, 100, 30]);
  });
});
