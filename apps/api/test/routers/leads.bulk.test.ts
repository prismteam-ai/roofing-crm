// undoCreate, createMany, presence through the real router + service + repo over FakeLeadsTable.
import { describe, expect, it } from "vitest";
import { createCallerFactory } from "../../src/trpc.js";
import { appRouter } from "../../src/routers/index.js";
import { createDynamoLeadRepo } from "../../src/adapters/leadRepo.js";
import { createLeadService, CREATE_MANY_CONCURRENCY } from "../../src/services/leads.js";
import { FakeLeadsTable } from "../support/fakeLeadsTable.js";

const caller = createCallerFactory(appRouter);
function setup(
  opts: { now?: () => Date; userId?: string; client?: ReturnType<FakeLeadsTable["client"]> } = {},
) {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({
    tableName: "crm-leads",
    client: opts.client ?? table.client(),
    sleep: async () => {},
  });
  const svc = createLeadService(repo, opts.now ? { now: opts.now } : {});
  const as = (userId: string) => caller({ requestId: "r", userId, leadService: svc });
  return { table, as, c: as(opts.userId ?? "rep-1") };
}
const item = (id: string) => ({
  fips: "48453",
  requestIdentifier: id,
  address: `${id} Main St`,
  lat: 30.2,
  lon: -97.7,
  signals: { roofAgeYears: 20 },
  sourceManifestCid: "bafyRun1",
  createdFrom: "list" as const,
});
const key = (id: string) => `48453:tcad:${id}`;

describe("leads.createMany", () => {
  it("creates, reports duplicates as already (not errors) and failures per item, in input order", async () => {
    const { c } = setup();
    await c.leads.create(item("A"));
    const res = await c.leads.createMany({ items: [item("A"), item("B"), item("C")] });
    expect(res.already).toEqual([key("A")]);
    expect(res.created.map((x) => x.leadKey)).toEqual([key("B"), key("C")]);
    expect(res.created[0]?.leadId).toMatch(/^[0-9A-Z]{26}$/);
    expect(res.failed).toEqual([]);
  });

  it("uses the same create path: LEAD + SIGNALS + EVT#0 per item, assignee is the caller", async () => {
    const { c, table } = setup();
    await c.leads.createMany({ items: [item("B")] });
    expect(table.transactions[0]).toHaveLength(3);
    expect(table.items.get(`${key("B")}\u0000LEAD`)).toMatchObject({
      assignee: "rep-1",
      createdFrom: "list",
    });
  });

  it("is validated: 0 and 26 items, and each item, are refused", async () => {
    const { c } = setup();
    await expect(c.leads.createMany({ items: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const many = Array.from({ length: 26 }, (_, i) => item(String(i)));
    await expect(c.leads.createMany({ items: many })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.createMany({ items: [{ ...item("A"), lat: 999 }] })).rejects.toMatchObject(
      {
        code: "BAD_REQUEST",
      },
    );
  });

  it("an unexpected store error fails only that item, with a code and no PII", async () => {
    const t = new FakeLeadsTable();
    const inner = t.client();
    const client = {
      send: async (cmd: { input: { TransactItems?: { Put?: { Item: { pk: string } } }[] } }) => {
        if (cmd.input.TransactItems?.[0]?.Put?.Item.pk === key("BAD"))
          throw Object.assign(new Error("boom 1 BAD St"), {
            name: "ProvisionedThroughputExceededException",
          });
        return inner.send(cmd as never);
      },
    } as unknown as ReturnType<FakeLeadsTable["client"]>;
    const { c } = setup({ client });
    const res = await c.leads.createMany({ items: [item("OK"), item("BAD")] });
    expect(res.created.map((x) => x.leadKey)).toEqual([key("OK")]);
    expect(res.failed).toEqual([
      { leadKey: key("BAD"), code: "ProvisionedThroughputExceededException" },
    ]);
  });

  it("never runs more than 3 creates at once", async () => {
    const t = new FakeLeadsTable();
    const inner = t.client();
    let live = 0;
    let peak = 0;
    const client = {
      send: async (cmd: never) => {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        try {
          return await inner.send(cmd);
        } finally {
          live--;
        }
      },
    } as unknown as ReturnType<FakeLeadsTable["client"]>;
    const { c } = setup({ client });
    const res = await c.leads.createMany({
      items: Array.from({ length: 12 }, (_, i) => item(`N${String(i)}`)),
    });
    expect(res.created).toHaveLength(12);
    expect(peak).toBe(CREATE_MANY_CONCURRENCY);
  });
});

describe("leads.undoCreate", () => {
  it("deletes a lead the caller just created, then it can be created again", async () => {
    const { c } = setup();
    const lead = await c.leads.create(item("A"));
    expect(await c.leads.undoCreate({ leadKey: key("A"), leadId: lead.leadId })).toEqual({
      deleted: true,
    });
    expect(await c.leads.undoCreate({ leadKey: key("A") })).toEqual({
      deleted: false,
      reason: "NOT_FOUND",
    });
    await expect(c.leads.create(item("A"))).resolves.toMatchObject({ leadKey: key("A") });
  });

  it("returns typed reasons for another user's lead and for a changed lead", async () => {
    const { c, as } = setup();
    await c.leads.create(item("A"));
    expect(await as("rep-2").leads.undoCreate({ leadKey: key("A") })).toEqual({
      deleted: false,
      reason: "NOT_OWNER",
    });
    await c.leads.addNote({ leadKey: key("A"), text: "called" });
    expect(await c.leads.undoCreate({ leadKey: key("A") })).toEqual({
      deleted: false,
      reason: "CHANGED",
    });
  });

  it("refuses after 15 minutes (TOO_OLD) and allows at 14", async () => {
    let now = new Date("2026-10-24T10:00:00.000Z");
    const { c } = setup({ now: () => now });
    await c.leads.createMany({ items: [item("A"), item("B")] });
    now = new Date("2026-10-24T10:14:00.000Z");
    expect(await c.leads.undoCreate({ leadKey: key("A") })).toEqual({ deleted: true });
    now = new Date("2026-10-24T10:15:01.000Z");
    expect(await c.leads.undoCreate({ leadKey: key("B") })).toEqual({
      deleted: false,
      reason: "TOO_OLD",
    });
  });

  it("validates input and requires sign-in", async () => {
    const { c } = setup();
    await expect(c.leads.undoCreate({ leadKey: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    const anon = caller({
      requestId: "r",

      leadService: createLeadService(
        createDynamoLeadRepo({ tableName: "t", client: new FakeLeadsTable().client() }),
      ),
    });
    await expect(anon.leads.undoCreate({ leadKey: key("A") })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("leads.presence", () => {
  it("shows leads of every assignee with only requestIdentifier, leadKey, leadId, status", async () => {
    const { c, as } = setup();
    await c.leads.create(item("A"));
    await as("rep-2").leads.create(item("B"));
    const rows = await c.leads.presence({ requestIdentifiers: ["A", "B", "Z"] });
    expect(rows.map((r) => Object.keys(r).sort())).toEqual([
      ["leadId", "leadKey", "requestIdentifier", "status"],
      ["leadId", "leadKey", "requestIdentifier", "status"],
    ]);
    expect(rows.map((r) => r.requestIdentifier).sort()).toEqual(["A", "B"]);
  });

  it("is bounded to 100 identifiers and validated", async () => {
    const { c } = setup();
    const ids = Array.from({ length: 101 }, (_, i) => String(i));
    await expect(c.leads.presence({ requestIdentifiers: ids })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.presence({ requestIdentifiers: [""] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c.leads.presence({ requestIdentifiers: Array.from({ length: 100 }, (_, i) => String(i)) }),
    ).resolves.toEqual([]);
  });
});
