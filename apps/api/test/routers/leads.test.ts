// T010: `leads` tRPC router — Zod validation, error mapping, NOT_FOUND. Uses the REAL
// createLeadService + leadRepo over FakeLeadsTable so error mapping is tested end to end.
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "../../src/trpc.js";
import { appRouter } from "../../src/routers/index.js";
import { createDynamoLeadRepo } from "../../src/adapters/leadRepo.js";
import { createLeadService } from "../../src/services/leads.js";
import { FakeLeadsTable } from "../support/fakeLeadsTable.js";

const caller = createCallerFactory(appRouter);
function ctx() {
  const table = new FakeLeadsTable();
  const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
  return {
    table,
    c: caller({ requestId: "req-1", userId: "rep-1", leadService: createLeadService(repo) }),
  };
}
const input = {
  fips: "48453",
  requestIdentifier: "0208011301",
  address: "1 Main St",
  lat: 30.2,
  lon: -97.7,
  signals: { roofAgeYears: 20 },
  sourceManifestCid: "bafyRun1",
  createdFrom: "map" as const,
};
const KEY = "48453:tcad:0208011301";

async function causeCode(
  p: Promise<unknown>,
): Promise<{ code: string; cause: string | undefined }> {
  const e = (await p.catch((x: unknown) => x)) as TRPCError;
  expect(e).toBeInstanceOf(TRPCError);
  return { code: e.code, cause: (e.cause as { code?: string } | undefined)?.code };
}

describe("leads router (T010)", () => {
  it("create returns the Lead; a duplicate maps to cause.code ALREADY_EXISTS", async () => {
    const { c } = ctx();
    const lead = await c.leads.create(input);
    expect(lead).toMatchObject({ leadKey: KEY, status: "new", assignee: "rep-1" });
    expect(await causeCode(c.leads.create(input))).toEqual({
      code: "CONFLICT",
      cause: "ALREADY_EXISTS",
    });
  });

  it("create input is Zod-validated (empty fips, bad lat, unknown createdFrom)", async () => {
    const { c } = ctx();
    await expect(c.leads.create({ ...input, fips: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.create({ ...input, lat: 999 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.create({ ...input, createdFrom: "fax" as never })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("stores roofAgeConfidence in the signals snapshot and rejects a bad enum", async () => {
    const { c } = ctx();
    await c.leads.create({
      ...input,
      signals: { roofAgeYears: 20, roofAgeConfidence: "low" },
    });
    expect((await c.leads.get({ leadKey: KEY })).signals?.roofAgeConfidence).toBe("low");
    await expect(
      c.leads.create({
        ...input,
        requestIdentifier: "x2",
        signals: { roofAgeConfidence: "certain" as never },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("addNote rejects text over 4,000 chars, accepts exactly 4,000", async () => {
    const { c } = ctx();
    await c.leads.create(input);
    await expect(c.leads.addNote({ leadKey: KEY, text: "x".repeat(4001) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.addNote({ leadKey: KEY, text: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.addNote({ leadKey: KEY, text: "x".repeat(4000) })).resolves.toMatchObject({
      eventSequence: 1,
    });
  });

  it("addNote rejects whitespace-only text and stores the trimmed text", async () => {
    const { c } = ctx();
    await c.leads.create(input);
    await expect(c.leads.addNote({ leadKey: KEY, text: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await c.leads.addNote({ leadKey: KEY, text: "  hello  " });
    const d = await c.leads.get({ leadKey: KEY });
    expect(d.notes.map((n) => n.change)).toEqual(['note: "hello"']);
  });

  it("updateStatus rejects an unknown status and updates a valid one", async () => {
    const { c } = ctx();
    await c.leads.create(input);
    await expect(
      c.leads.updateStatus({ leadKey: KEY, status: "hot" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      c.leads.updateStatus({ leadKey: KEY, status: "contacted" }),
    ).resolves.toMatchObject({ status: "contacted" });
  });

  it("get returns detail with notes/history; NOT_FOUND for a missing key", async () => {
    const { c } = ctx();
    await c.leads.create(input);
    await c.leads.addNote({ leadKey: KEY, text: "hello" });
    const d = await c.leads.get({ leadKey: KEY });
    expect(d.notes.map((n) => n.change)).toEqual(['note: "hello"']);
    expect(d.history.map((h) => h.kind)).toEqual(["create", "note"]);
    expect(d.signals?.roofAgeYears).toBe(20);
    expect(d.notInCurrentRun).toBe(false);
    await expect(c.leads.get({ leadKey: "48453:tcad:none" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("updateStatus on an unknown key -> NOT_FOUND; stale sequence -> CONFLICT with cause STALE_SEQUENCE", async () => {
    const { c, table } = ctx();
    await expect(
      c.leads.updateStatus({ leadKey: "48453:tcad:none", status: "won" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await c.leads.create(input);
    await c.leads.addNote({ leadKey: KEY, text: "n" });
    expect(table.items.size).toBeGreaterThan(0);
    expect(
      await causeCode(c.leads.updateStatus({ leadKey: KEY, status: "won", expectedSequence: 0 })),
    ).toEqual({ code: "CONFLICT", cause: "STALE_SEQUENCE" });
  });

  it("assign gives the lead to the CALLER, appends an assignee event, and ignores a supplied assignee", async () => {
    const { table, c } = ctx();
    await c.leads.create(input);
    const service = createLeadService(
      createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() }),
    );
    const rep2 = caller({ requestId: "r2", userId: "rep-2", leadService: service });
    const res = await rep2.leads.assign({
      leadKey: KEY,
      expectedSequence: 0,
      assignee: "someone-else",
    } as never);
    expect(res).toMatchObject({ assignee: "rep-2", eventSequence: 1 });
    const d = await c.leads.get({ leadKey: KEY });
    expect(d.assignee).toBe("rep-2");
    expect(d.history.map((h) => [h.kind, h.by, h.change])).toEqual([
      ["create", "rep-1", "created"],
      ["assignee", "rep-2", "assignee: rep-1 -> rep-2"],
    ]);
  });

  it("assign validates input and maps typed errors (NOT_FOUND, STALE_SEQUENCE)", async () => {
    const { c, table } = ctx();
    await expect(c.leads.assign({ leadKey: "", expectedSequence: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.assign({ leadKey: KEY, expectedSequence: -1 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(c.leads.assign({ leadKey: KEY } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c.leads.assign({ leadKey: "48453:tcad:none", expectedSequence: 0 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await c.leads.create(input);
    await c.leads.addNote({ leadKey: KEY, text: "n" });
    const rep2 = caller({
      requestId: "r2",
      userId: "rep-2",
      leadService: createLeadService(
        createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() }),
      ),
    });
    expect(await causeCode(rep2.leads.assign({ leadKey: KEY, expectedSequence: 0 }))).toEqual({
      code: "CONFLICT",
      cause: "STALE_SEQUENCE",
    });
  });

  it("procedures need an authenticated user and a wired service", async () => {
    const noUser = caller({
      requestId: "r",
      leadService: createLeadService(
        createDynamoLeadRepo({ tableName: "t", client: new FakeLeadsTable().client() }),
      ),
    });
    await expect(noUser.leads.create(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const noSvc = caller({ requestId: "r", userId: "u" });
    await expect(noSvc.leads.get({ leadKey: KEY })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
