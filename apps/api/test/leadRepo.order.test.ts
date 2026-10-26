// B-07 AC-1 ("appears at the top of the lead list"), found live by TC-NF-01: with several leads
// the list showed the OLDEST first, because the GSI query used the index's natural ascending
// order. Both lookups must return the newest lead first.
import { describe, expect, it } from "vitest";
import { createDynamoLeadRepo } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { newLead } from "./support/leadFixtures.js";

async function seed() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
  for (const [i, createdAt] of [
    "2026-10-24T10:00:00.000Z",
    "2026-10-24T10:05:00.000Z",
    "2026-10-24T10:10:00.000Z",
  ].entries()) {
    await repo.create(newLead({ leadKey: `48453:tcad:00${i}`, leadId: `01JLEAD${i}`, createdAt }));
  }
  return repo;
}

describe("lead lookups return the newest lead first", () => {
  it("listByAssignee", async () => {
    const leads = await (await seed()).listByAssignee("rep-1");
    expect(leads.map((l) => l.createdAt)).toEqual([
      "2026-10-24T10:10:00.000Z",
      "2026-10-24T10:05:00.000Z",
      "2026-10-24T10:00:00.000Z",
    ]);
  });

  it("listByStatus", async () => {
    const leads = await (await seed()).listByStatus("new");
    expect(leads[0]?.createdAt).toBe("2026-10-24T10:10:00.000Z");
    expect(leads[2]?.createdAt).toBe("2026-10-24T10:00:00.000Z");
  });
});
