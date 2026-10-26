// T009: leadService calls the right leadRepo method per operation and surfaces its errors
// unchanged; the repo is injected, never imported by the service.
import { describe, expect, it, vi } from "vitest";
import type { LeadIndex } from "../../src/adapters/duckDbParquet.js";
import type { LeadRepo } from "../../src/adapters/leadRepo.js";
import { createLeadService } from "../../src/services/leads.js";
import { LeadAlreadyExistsError } from "../../src/leadErrors.js";
import { KEY } from "../support/leadFixtures.js";

function fakeRepo(overrides: Partial<LeadRepo> = {}): LeadRepo {
  const lead = {
    leadKey: KEY,
    leadId: "L",
    address: "a",
    lat: 1,
    lon: 2,
    status: "new" as const,
    assignee: "rep-1",
    createdFrom: "map" as const,
    sourceManifestCid: "m1",
    createdAt: "t",
    eventSequence: 0,
  };
  return {
    create: vi.fn(async () => lead),
    updateStatus: vi.fn(async () => lead),
    addNote: vi.fn(async () => lead),
    assign: vi.fn(async () => lead),
    get: vi.fn(async () => ({ lead, signals: undefined, events: [] })),
    listByAssignee: vi.fn(async () => [lead]),
    listByStatus: vi.fn(async () => [lead]),
    undoCreate: vi.fn(async () => ({ deleted: true as const })),
    presence: vi.fn(async () => []),
    signalsFor: vi.fn(async () => new Map()),
    latestEvents: vi.fn(async () => new Map()),
    ...overrides,
  };
}
const NOW = new Date("2026-10-24T12:00:00.000Z");
const opts = { now: () => NOW, newId: () => "01JFIXEDID" };

describe("createLeadService (T009)", () => {
  it("create derives the key via leadKey(), sets assignee/createdAt/leadId, calls repo.create once", async () => {
    const repo = fakeRepo();
    const svc = createLeadService(repo, opts);
    await svc.create(
      {
        fips: "48453",
        requestIdentifier: "0208011301",
        address: "a",
        lat: 1,
        lon: 2,
        signals: {},
        sourceManifestCid: "m1",
        createdFrom: "map",
      },
      "rep-1",
    );
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leadKey: KEY,
        leadId: "01JFIXEDID",
        assignee: "rep-1",
        createdAt: NOW.toISOString(),
      }),
    );
  });

  it("assign delegates to repo.assign with the assignee, the author, a timestamp and the sequence", async () => {
    const repo = fakeRepo();
    const svc = createLeadService(repo, opts);
    await svc.assign(KEY, "rep-2", "rep-2", 3);
    expect(repo.assign).toHaveBeenCalledWith({
      leadKey: KEY,
      assignee: "rep-2",
      by: "rep-2",
      at: NOW.toISOString(),
      expectedSequence: 3,
    });
  });

  it("updateStatus / addNote / get / list delegate to the matching repo methods", async () => {
    const repo = fakeRepo();
    const svc = createLeadService(repo, opts);
    await svc.updateStatus(KEY, "contacted", "rep-1");
    await svc.addNote(KEY, "hi", "rep-1");
    await svc.get(KEY);
    await svc.list({ assignee: "rep-1" }, "rep-1");
    expect(repo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ leadKey: KEY, status: "contacted", by: "rep-1" }),
    );
    expect(repo.addNote).toHaveBeenCalledWith(
      expect.objectContaining({ leadKey: KEY, text: "hi" }),
    );
    expect(repo.get).toHaveBeenCalledWith(KEY);
    expect(repo.listByAssignee).toHaveBeenCalledWith("rep-1");
  });

  it("surfaces the repo's errors unchanged (same instance)", async () => {
    const boom = new LeadAlreadyExistsError(KEY);
    const svc = createLeadService(
      fakeRepo({
        create: vi.fn(async () => {
          throw boom;
        }),
      }),
      opts,
    );
    await expect(
      svc.create(
        {
          fips: "48453",
          requestIdentifier: "1",
          address: "a",
          lat: 1,
          lon: 2,
          signals: {},
          sourceManifestCid: "m",
          createdFrom: "map",
        },
        "r",
      ),
    ).rejects.toBe(boom);
  });
});

// AC-5: a lead is "not in the current run" only when its manifest differs AND its property is
// absent from the current index; computed at read time.
describe("createLeadService not-in-run (AC-5)", () => {
  function fakeIndex(over: Partial<Record<string, unknown>> = {}) {
    return {
      indexInfo: vi.fn(async () => ({
        manifestCid: "m2",
        propertyCount: 1,
        permitCount: 0,
        promotedAt: "t",
      })),
      presentRequestIdentifiers: vi.fn(
        async (ids: readonly string[]) => new Set<string>(ids.filter((i) => i === "0208011301")),
      ),
      currentRunId: vi.fn(async () => "run-two"),
      ...over,
    } as unknown as LeadIndex & {
      presentRequestIdentifiers: ReturnType<typeof vi.fn>;
      currentRunId: ReturnType<typeof vi.fn>;
    };
  }
  const withKey = (leadKey: string) => ({
    leadKey,
    leadId: "L",
    address: "a",
    lat: 1,
    lon: 2,
    status: "new" as const,
    assignee: "rep-1",
    createdFrom: "map" as const,
    sourceManifestCid: "m1",
    createdAt: "t",
    eventSequence: 0,
  });

  it("differing manifest + property still present => not flagged", async () => {
    const index = fakeIndex();
    const svc = createLeadService(fakeRepo(), { ...opts, leadIndex: index });
    const d = await svc.get(KEY);
    expect(index.presentRequestIdentifiers).toHaveBeenCalledWith(["0208011301"]);
    expect(d?.notInCurrentRun).toBe(false);
    expect(d?.currentRunId).toBeUndefined();
  });

  it("differing manifest + property absent => flagged, with currentRunId", async () => {
    const lead = withKey("48453:tcad:GONE");
    const repo = fakeRepo({ get: vi.fn(async () => ({ lead, signals: undefined, events: [] })) });
    const svc = createLeadService(repo, { ...opts, leadIndex: fakeIndex() });
    const d = await svc.get(lead.leadKey);
    expect(d?.notInCurrentRun).toBe(true);
    expect(d?.currentManifestCid).toBe("m2");
    expect(d?.currentRunId).toBe("run-two");
  });

  it("same manifest => not flagged and no presence query", async () => {
    const index = fakeIndex({
      indexInfo: vi.fn(async () => ({
        manifestCid: "m1",
        propertyCount: 1,
        permitCount: 0,
        promotedAt: "t",
      })),
    });
    const svc = createLeadService(fakeRepo(), { ...opts, leadIndex: index });
    const d = await svc.get(KEY);
    expect(d?.notInCurrentRun).toBe(false);
    expect(index.presentRequestIdentifiers).not.toHaveBeenCalled();
    const l = await svc.list({ assignee: "rep-1" }, "rep-1");
    expect(l.leads[0]?.notInCurrentRun).toBe(false);
    expect(index.presentRequestIdentifiers).not.toHaveBeenCalled();
  });

  it("index unavailable => never flagged", async () => {
    const index = fakeIndex({
      indexInfo: vi.fn(async () => {
        throw new Error("no run");
      }),
    });
    const svc = createLeadService(fakeRepo(), { ...opts, leadIndex: index });
    expect((await svc.get(KEY))?.notInCurrentRun).toBe(false);
    expect(index.presentRequestIdentifiers).not.toHaveBeenCalled();
  });

  it("list batches one presence query for only the differing-manifest leads", async () => {
    const a = withKey("48453:tcad:0208011301"); // present
    const b = withKey("48453:tcad:GONE"); // absent
    const c = { ...withKey("48453:tcad:SAME"), sourceManifestCid: "m2" }; // same manifest
    const index = fakeIndex();
    const repo = fakeRepo({ listByAssignee: vi.fn(async () => [a, b, c]) });
    const svc = createLeadService(repo, { ...opts, leadIndex: index });
    const out = await svc.list({}, "rep-1");
    expect(index.presentRequestIdentifiers).toHaveBeenCalledTimes(1);
    expect(index.presentRequestIdentifiers).toHaveBeenCalledWith(["0208011301", "GONE"]);
    expect(out.leads.map((l) => l.notInCurrentRun)).toEqual([false, true, false]);
  });
});
