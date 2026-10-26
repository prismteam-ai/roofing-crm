// T011: leads.list forwards geo/roof-age/permit filters to the LeadIndex port (the same calls
// search.properties makes) and sends assignee/status-only queries to the repo's GSI methods.
import { describe, expect, it, vi } from "vitest";
import { createCallerFactory } from "../../src/trpc.js";
import { appRouter } from "../../src/routers/index.js";
import { createLeadService } from "../../src/services/leads.js";
import type { LeadRepo } from "../../src/adapters/leadRepo.js";
import type { LeadIndex } from "../../src/adapters/duckDbParquet.js";

const caller = createCallerFactory(appRouter);
const mk = (n: number, status: "new" | "won" = "new", m = "run2") => ({
  leadKey: `48453:tcad:${n}`,
  leadId: `L${n}`,
  address: "a",
  lat: 1,
  lon: 2,
  status,
  assignee: "rep-1",
  createdFrom: "map" as const,
  sourceManifestCid: m,
  createdAt: `2026-10-24T10:0${n}:00.000Z`,
  eventSequence: 0,
});
const leads = [mk(1), mk(2, "won"), mk(3, "new", "run1")];

function repo(): LeadRepo {
  return {
    create: vi.fn(),
    updateStatus: vi.fn(),
    addNote: vi.fn(),
    get: vi.fn(),
    listByAssignee: vi.fn(async () => leads),
    listByStatus: vi.fn(async () => leads.filter((l) => l.status === "won")),
    signalsFor: vi.fn(async () => new Map()),
    latestEvents: vi.fn(async () => new Map()),
  } as unknown as LeadRepo;
}
function index(): LeadIndex {
  return {
    indexInfo: vi.fn(async () => ({
      manifestCid: "run2",
      propertyCount: 2,
      permitCount: 1,
      promotedAt: "t",
    })),
    searchProperties: vi.fn(async () => [
      { propertyCid: "bafyP1", requestIdentifier: "1" },
      { propertyCid: "bafyP2", requestIdentifier: "3" },
    ]),
    searchPermits: vi.fn(async () => [{ propertyCid: "bafyP1", statusClass: "open" }]),
    getProperty: vi.fn(),
    // property "3" is absent from run2, so the run1 lead is flagged (AC-5)
    presentRequestIdentifiers: vi.fn(async () => new Set<string>()),
    currentRunId: vi.fn(async () => "run-two"),
  } as unknown as LeadIndex;
}
const c = (r: LeadRepo, i?: LeadIndex) =>
  caller({
    requestId: "r",
    userId: "rep-1",
    leadService: createLeadService(r, i ? { leadIndex: i } : {}),
  });

describe("leads.list (T011)", () => {
  it("roofAgeMinYears/radiusMi/center forward to LeadIndex.searchProperties and intersect with the caller's leads", async () => {
    const r = repo();
    const i = index();
    const out = await c(r, i).leads.list({
      filters: { roofAgeMinYears: 15, radiusMi: 5, centerLat: 30.2, centerLon: -97.7 },
    });
    expect(i.searchProperties).toHaveBeenCalledWith({
      center: { lat: 30.2, lng: -97.7 },
      radiusMi: 5,
      roofAgeMinYears: 15,
      limit: 1_000_000,
    });
    expect(r.listByAssignee).toHaveBeenCalledWith("rep-1");
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:1", "48453:tcad:3"]);
    expect(out.totalCount).toBe(2);
  });

  it("permitStatus forwards to searchPermits and keeps only leads whose property has a matching permit", async () => {
    const r = repo();
    const i = index();
    const out = await c(r, i).leads.list({ filters: { permitStatus: "open" } });
    expect(i.searchPermits).toHaveBeenCalled();
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:1"]);
  });

  it("with the SQL method, filters go to matchingRequestIdentifiers with only the caller's own ids and no property is listed", async () => {
    const r = repo();
    const i = index();
    const matching = vi.fn(async () => new Set(["1", "3"]));
    i.matchingRequestIdentifiers = matching;
    const out = await c(r, i).leads.list({
      filters: {
        roofAgeMinYears: 15,
        radiusMi: 25,
        centerLat: 30.2,
        centerLon: -97.7,
        permitStatus: "open",
      },
    });
    expect(matching).toHaveBeenCalledWith({
      requestIdentifiers: ["1", "2", "3"],
      center: { lat: 30.2, lng: -97.7 },
      radiusMi: 25,
      roofAgeMinYears: 15,
      permitStatus: "open",
    });
    expect(i.searchProperties).not.toHaveBeenCalled();
    expect(i.searchPermits).not.toHaveBeenCalled();
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:1", "48453:tcad:3"]);
    expect(out.totalCount).toBe(2);
  });

  it("status-only defaults to the caller's leads (GSI1, filtered in memory); explicit assignee to listByAssignee; LeadIndex untouched", async () => {
    const r = repo();
    const i = index();
    const a = await c(r, i).leads.list({ status: "won" });
    expect(r.listByStatus).not.toHaveBeenCalled();
    expect(r.listByAssignee).toHaveBeenCalledWith("rep-1");
    expect(a.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:2"]);
    await c(r, i).leads.list({ assignee: "rep-9" });
    expect(r.listByAssignee).toHaveBeenCalledWith("rep-9");
    expect(i.searchProperties).not.toHaveBeenCalled();
  });

  it("a status filter does not show another user's leads", async () => {
    const other = { ...mk(9), assignee: "rep-2" };
    const r = repo();
    r.listByAssignee = vi.fn(async (who: string) =>
      who === "rep-1" ? leads : who === "rep-2" ? [other] : [],
    );
    const out = await c(r).leads.list({ status: "new" });
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:1", "48453:tcad:3"]);
  });

  it("a lead on the 120th property is listed when the index only returns all rows for a large limit", async () => {
    const many = Array.from({ length: 150 }, (_, n) => ({
      propertyCid: `bafyP${n + 1}`,
      requestIdentifier: String(n + 1),
    }));
    const i = index();
    i.searchProperties = vi.fn(async (q: { limit?: number }) =>
      many.slice(0, q.limit ?? 100),
    ) as unknown as LeadIndex["searchProperties"];
    const r = repo();
    r.listByAssignee = vi.fn(async () => [mk(120)]);
    const out = await c(r, i).leads.list({ filters: { roofAgeMinYears: 15 } });
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:120"]);
  });

  it("rejects a partial location filter and accepts all-or-none", async () => {
    const r = repo();
    const i = index();
    await expect(
      c(r, i).leads.list({ filters: { centerLat: 30.2, centerLon: -97.7 } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c(r, i).leads.list({ filters: { radiusMi: 5 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      c(r, i).leads.list({ filters: { radiusMi: 5, centerLat: 30.2, centerLon: -97.7 } }),
    ).resolves.toBeDefined();
    await expect(c(r, i).leads.list({ filters: {} })).resolves.toBeDefined();
  });

  it("annotates notInCurrentRun at read time from the current manifest, never stored", async () => {
    const out = await c(repo(), index()).leads.list({});
    expect(out.leads.map((l) => l.notInCurrentRun)).toEqual([false, false, true]);
  });

  it("limit <= 100 and cursor paging; totalCount stays the full match count", async () => {
    const r = repo();
    await expect(c(r).leads.list({ limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const p1 = await c(r).leads.list({ limit: 2 });
    expect(p1.leads).toHaveLength(2);
    expect(p1.totalCount).toBe(3);
    const cursor = p1.nextCursor;
    if (cursor === undefined) throw new Error("first page should carry a nextCursor");
    const p2 = await c(r).leads.list({ limit: 2, cursor });
    expect(p2.leads).toHaveLength(1);
    expect(p2.nextCursor).toBeUndefined();
  });
});

describe("leads.list permitOpenDaysMin and the new output fields", () => {
  it.each([0, 3651, 1.5, -1])("rejects permitOpenDaysMin %s", async (bad) => {
    await expect(
      c(repo(), index()).leads.list({ filters: { permitOpenDaysMin: bad } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each([1, 365, 3650])("accepts permitOpenDaysMin %s", async (ok) => {
    const i = index();
    i.matchingRequestIdentifiers = vi.fn(async () => new Set(["1"]));
    const out = await c(repo(), i).leads.list({ filters: { permitOpenDaysMin: ok } });
    expect(out.leads.map((l) => l.leadKey)).toEqual(["48453:tcad:1"]);
  });

  it("every item carries signals and lastActivity (null when unknown), existing fields kept", async () => {
    const out = await c(repo()).leads.list({});
    expect(out.leads[0]).toMatchObject({
      leadKey: "48453:tcad:1",
      status: "new",
      notInCurrentRun: false,
      signals: null,
      lastActivity: { kind: "created" },
    });
  });
});
