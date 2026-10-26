// leads.list enrichment: signals (one batched read), lastActivity (denormalised, with a bounded
// fallback for old leads), permitOpenDaysMin, numeric offset cursor, totalCount, payload size.
import { describe, expect, it, vi } from "vitest";
import { createLeadService } from "../../src/services/leads.js";
import {
  createDynamoLeadRepo,
  type LeadRepo,
  type StoredLead,
} from "../../src/adapters/leadRepo.js";
import type { LeadIndex } from "../../src/adapters/duckDbParquet.js";
import { FakeLeadsTable } from "../support/fakeLeadsTable.js";
import { newLead } from "../support/leadFixtures.js";

const stored = (n: number, extra: Partial<StoredLead> = {}): StoredLead => ({
  leadKey: `48453:tcad:${String(n)}`,
  leadId: `L${String(n)}`,
  address: "a",
  lat: 1,
  lon: 2,
  status: "new",
  assignee: "rep-1",
  createdFrom: "map",
  sourceManifestCid: "run2",
  createdAt: `2026-10-24T10:00:${String(n).padStart(2, "0")}.000Z`,
  eventSequence: 0,
  ...extra,
});

function fakeRepo(leads: StoredLead[]): LeadRepo {
  return {
    listByAssignee: vi.fn(async () => leads),
    listByStatus: vi.fn(async () => []),
    signalsFor: vi.fn(async () => new Map()),
    latestEvents: vi.fn(async () => new Map()),
  } as unknown as LeadRepo;
}

describe("leads.list enrichment", () => {
  it("fetches signals for the page with ONE signalsFor call and returns null when missing", async () => {
    const leads = [stored(3), stored(2), stored(1)];
    const repo = fakeRepo(leads);
    (repo.signalsFor as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([["48453:tcad:3", { roofAgeYears: 23, openDays: 800, capturedAt: "t" }]]),
    );
    const out = await createLeadService(repo).list({ limit: 2 }, "rep-1");
    expect(repo.signalsFor).toHaveBeenCalledTimes(1);
    expect(repo.signalsFor).toHaveBeenCalledWith(["48453:tcad:3", "48453:tcad:2"]);
    expect(out.leads[0]?.signals).toMatchObject({ roofAgeYears: 23, openDays: 800 });
    expect(out.leads[1]?.signals).toBeNull();
  });

  it("uses the denormalised lastActivity; synthesises 'created' for an untouched old lead; reads the latest event for a touched old one", async () => {
    const leads = [
      stored(3, {
        eventSequence: 2,
        lastActivity: { at: "2026-10-25T09:00:00.000Z", kind: "note", excerpt: "hi" },
      }),
      stored(2), // old, sequence 0: no read needed
      stored(1, { eventSequence: 1 }), // old, touched: read its latest event
    ];
    const repo = fakeRepo(leads);
    (repo.latestEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([
        [
          "48453:tcad:1",
          {
            sequence: 1,
            at: "2026-10-24T12:00:00.000Z",
            by: "r",
            change: 'note: "called  owner"',
            kind: "note",
          },
        ],
      ]),
    );
    const out = await createLeadService(repo).list({}, "rep-1");
    expect(repo.latestEvents).toHaveBeenCalledWith(["48453:tcad:1"]);
    expect(out.leads[0]?.lastActivity).toEqual({
      at: "2026-10-25T09:00:00.000Z",
      kind: "note",
      excerpt: "hi",
    });
    expect(out.leads[1]?.lastActivity).toEqual({ at: leads[1]?.createdAt, kind: "created" });
    expect(out.leads[2]?.lastActivity).toEqual({
      at: "2026-10-24T12:00:00.000Z",
      kind: "note",
      excerpt: "called owner",
    });
  });

  it("the event fallback reads at most 25 leads per page; the rest are null, never a loop of reads", async () => {
    const leads = Array.from({ length: 40 }, (_, i) => stored(i + 1, { eventSequence: 3 }));
    const repo = fakeRepo(leads);
    const out = await createLeadService(repo).list({ limit: 40 }, "rep-1");
    const asked = (repo.latestEvents as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string[];
    expect(asked).toHaveLength(25);
    expect(out.leads.slice(25).every((l) => l.lastActivity === null)).toBe(true);
  });

  it("a note fallback event maps status->status, create->created", async () => {
    const leads = [stored(2, { eventSequence: 1 })];
    const repo = fakeRepo(leads);
    (repo.latestEvents as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([
        [
          "48453:tcad:2",
          { sequence: 1, at: "t1", by: "r", change: "status: new -> won", kind: "statusChange" },
        ],
      ]),
    );
    const out = await createLeadService(repo).list({}, "rep-1");
    expect(out.leads[0]?.lastActivity).toEqual({ at: "t1", kind: "status" });
  });

  it("cursor is a numeric offset (page n = (n-1)*limit) and totalCount is the full filtered count", async () => {
    const leads = Array.from({ length: 60 }, (_, i) => stored(60 - i));
    const svc = createLeadService(fakeRepo(leads));
    const p1 = await svc.list({ limit: 25 }, "rep-1");
    expect(p1.nextCursor).toBe("25");
    expect(p1.totalCount).toBe(60);
    const p3 = await svc.list({ limit: 25, cursor: "50" }, "rep-1");
    expect(p3.leads).toHaveLength(10);
    expect(p3.nextCursor).toBeUndefined();
    expect(p3.leads[0]?.leadKey).toBe(leads[50]?.leadKey);
  });

  it("permitOpenDaysMin goes to the SQL matcher with the other filters", async () => {
    const leads = [stored(1), stored(2)];
    const index = {
      indexInfo: vi.fn(async () => ({ manifestCid: "run2" })),
      presentRequestIdentifiers: vi.fn(async () => new Set<string>()),
      matchingRequestIdentifiers: vi.fn(async () => new Set(["2"])),
    } as unknown as LeadIndex;
    const out = await createLeadService(fakeRepo(leads), { leadIndex: index }).list(
      { filters: { permitOpenDaysMin: 1825, permitStatus: "open", roofAgeMinYears: 15 } },
      "rep-1",
    );
    expect(index.matchingRequestIdentifiers).toHaveBeenCalledWith({
      requestIdentifiers: ["1", "2"],
      roofAgeMinYears: 15,
      permitStatus: "open",
      permitOpenDaysMin: 1825,
    });
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:2"]);
    expect(out.totalCount).toBe(1);
  });

  it("permitOpenDaysMin alone also works on an index without the SQL method (searchPermits fallback)", async () => {
    const leads = [stored(1), stored(2)];
    const index = {
      indexInfo: vi.fn(async () => ({ manifestCid: "run2" })),
      presentRequestIdentifiers: vi.fn(async () => new Set<string>()),
      searchProperties: vi.fn(async () => [
        { propertyCid: "P1", requestIdentifier: "1" },
        { propertyCid: "P2", requestIdentifier: "2" },
      ]),
      searchPermits: vi.fn(async () => [{ propertyCid: "P2", statusClass: "open" }]),
    } as unknown as LeadIndex;
    const out = await createLeadService(fakeRepo(leads), { leadIndex: index }).list(
      { filters: { permitOpenDaysMin: 365 } },
      "rep-1",
    );
    expect(index.searchPermits).toHaveBeenCalledWith(
      expect.objectContaining({ openDaysMinimum: 365 }),
    );
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:2"]);
  });

  it("a 25-lead page with real notes and signals stays under 100 KiB", async () => {
    const table = new FakeLeadsTable();
    const repo = createDynamoLeadRepo({ tableName: "crm-leads", client: table.client() });
    for (let i = 0; i < 30; i++) {
      const key = `48453:tcad:${String(i)}`;
      await repo.create(
        newLead({
          leadKey: key,
          leadId: `L${String(i)}`,
          createdAt: `2026-10-24T10:00:${String(i).padStart(2, "0")}.000Z`,
          address: "Address not published in this run".padEnd(120, "."),
        }),
      );
      await repo.addNote({
        leadKey: key,
        text: "n".repeat(4000),
        by: "rep-1",
        at: "2026-10-25T00:00:00.000Z",
      });
    }
    const out = await createLeadService(repo).list({ limit: 25 }, "rep-1");
    expect(out.leads).toHaveLength(25);
    expect(out.leads[0]?.lastActivity?.excerpt?.length).toBeLessThanOrEqual(120);
    expect(table.batchGets).toHaveLength(1); // signals: one BatchGetItem for the page
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThan(100 * 1024);
  });
});
