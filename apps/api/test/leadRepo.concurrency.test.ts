// T007 (NFR-001): 20 concurrent creates for one key -> exactly 1 success, 19 ConditionalCheckFailed.
// Runs against FakeLeadsTable (in-memory, enforces TransactWriteItems conditions); see its header.
import { describe, expect, it } from "vitest";
import { createDynamoLeadRepo, LeadAlreadyExistsError } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

describe("leadRepo.create concurrency (T007)", () => {
  it("20 concurrent creates -> exactly 1 wins, 19 get ConditionalCheckFailed, 3 items exist", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => repo.create(newLead({ leadId: `01JLEAD${i}` }))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(19);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(LeadAlreadyExistsError);
      expect((f.reason as LeadAlreadyExistsError).code).toBe("ConditionalCheckFailed");
    }
    expect(table.items.size).toBe(3); // LEAD + SIGNALS + EVT#0, never doubled
    const winner = (ok[0] as PromiseFulfilledResult<{ leadId: string }>).value;
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({ leadId: winner.leadId });
  });
});
