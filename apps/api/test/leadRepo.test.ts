// T006: create writes LEAD + SIGNALS + EVT#0 transactionally; a second create for the same pk is
// refused with ConditionalCheckFailed (ADR-04, constitution P0-6).
import { describe, expect, it } from "vitest";
import { createDynamoLeadRepo, LeadAlreadyExistsError } from "../src/adapters/leadRepo.js";
import { FakeLeadsTable } from "./support/fakeLeadsTable.js";
import { KEY, newLead } from "./support/leadFixtures.js";

function setup() {
  const table = new FakeLeadsTable();
  return { table, repo: createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() }) };
}

describe("leadRepo.create (T006)", () => {
  it("writes LEAD + SIGNALS + EVT#0 in ONE transaction", async () => {
    const { table, repo } = setup();
    const lead = await repo.create(newLead());
    expect(table.transactions).toHaveLength(1);
    expect(table.transactions[0]).toHaveLength(3);
    const sks = [...table.items.values()].map((i) => i.sk).sort();
    expect(sks).toEqual(["EVT#0000000000", "LEAD", "SIGNALS"]);
    expect(lead).toMatchObject({
      leadKey: KEY,
      status: "new",
      assignee: "rep-1",
      eventSequence: 0,
    });
    const evt = table.items.get(`${KEY}\u0000EVT#0000000000`);
    expect(evt).toMatchObject({ sequence: 0, kind: "create", by: "rep-1" });
  });

  it("uses attribute_not_exists(pk) as the condition on the LEAD put (not an app-level check)", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const leadPut = table.transactions[0]?.find((t) => t.Put?.Item.sk === "LEAD");
    expect(leadPut?.Put?.ConditionExpression).toContain("attribute_not_exists(pk)");
  });

  it("rejects a second create for the same pk with ConditionalCheckFailed and writes nothing", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    const before = table.items.size;
    const err = await repo.create(newLead({ leadId: "01JOTHER" })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LeadAlreadyExistsError);
    expect((err as LeadAlreadyExistsError).code).toBe("ConditionalCheckFailed");
    expect(table.items.size).toBe(before);
    expect(table.items.get(`${KEY}\u0000LEAD`)).toMatchObject({
      leadId: "01JTESTLEAD0000000000000A",
    });
  });

  it("never keys on property_cid: pk is the {fips}:tcad:{request_identifier} key", async () => {
    const { table, repo } = setup();
    await repo.create(newLead());
    for (const item of table.items.values()) expect(item.pk).toBe(KEY);
  });
});
