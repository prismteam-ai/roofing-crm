import { randomUUID } from "node:crypto";
import type { LeadSignals } from "@crm/shared";
import { beforeEach, describe, expect, inject, test } from "vitest";
import {
  ActiveLeadExists,
  createLeadsRepo,
  createLeadsTable,
  documentClient,
  IllegalTransition,
  LeadCapExceeded,
  type LeadInput,
  type LeadsStore,
} from "../src/index.ts";

const CID1 = "bafkreigdrq3tmzv6wk4ymglnlncrxflgsdkcw6g4z6hmzbbtdtp4lxvdqi";
const CID2 = "bafkreihndgnyrwxk7pqrt4hbdng4zpthn4h75bpg37e4224m3bz6ixoj4u";
const FTL = { lat: 26.1224, lon: -80.1373 };

const signals = (over: Partial<LeadInput["signals"]> = {}): LeadInput["signals"] => ({
  roofAgeYears: 22,
  roofAgeBasis: "year_built",
  maxOpenDays: 6 * 366,
  bbbGrade: null,
  ownerLocationClass: "in_county",
  permitStatuses: ["open"],
  lat: 26.12,
  lon: -80.14,
  address: "100 SE 1st Ave",
  city: "Fort Lauderdale",
  ...over,
});
const input = (propertyId: string, over: Partial<LeadInput["signals"]> = {}): LeadInput => ({
  propertyId,
  manifestCid: CID1,
  signals: signals(over),
});

let store: LeadsStore;

beforeEach(async () => {
  const doc = documentClient({ endpoint: inject("dynamoEndpoint") });
  const tableName = `leads-${randomUUID()}`;
  await createLeadsTable(doc, tableName);
  store = createLeadsRepo({ doc, tableName, leadCreatesPerDay: 5 });
});

describe("creating leads", () => {
  test("the same property twice returns the existing lead", async () => {
    const r = store("ws1");
    const a = await r.createFromCandidate(input("P1"));
    const b = await r.createFromCandidate(input("P1"));
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ created: false, lead: { id: a.lead.id } });
    expect(await r.list()).toHaveLength(1);
  });

  test("concurrent creates for one property produce one lead", async () => {
    const r = store("ws1");
    const results = await Promise.all(Array.from({ length: 5 }, () => r.createFromCandidate(input("P1"))));
    expect(results.filter((x) => x.created)).toHaveLength(1);
    expect(new Set(results.map((x) => x.lead.id)).size).toBe(1);
    expect(await r.list()).toHaveLength(1);
  });

  test("two workspaces converting the same property each get their own lead and see only theirs", async () => {
    const a = await store("wsA").createFromCandidate(input("P1"));
    const b = await store("wsB").createFromCandidate(input("P1"));
    expect(a.created && b.created).toBe(true);
    expect(a.lead.id).not.toBe(b.lead.id);
    expect((await store("wsA").list()).map((l) => l.id)).toEqual([a.lead.id]);
    expect(await store("wsB").get(a.lead.id)).toBeNull();
  });

  test("createMany reports created vs existing", async () => {
    const r = store("ws1");
    await r.createFromCandidate(input("P1"));
    expect(await r.createMany([input("P1"), input("P2"), input("P3")])).toMatchObject({
      created: 2,
      existing: 1,
    });
  });

  test("creates over the daily workspace cap are rejected", async () => {
    const r = store("ws1");
    for (let i = 0; i < 5; i++) await r.createFromCandidate(input(`P${i}`));
    await expect(r.createFromCandidate(input("P9"))).rejects.toBeInstanceOf(LeadCapExceeded);
    // Returning an existing lead is not a create.
    expect((await r.createFromCandidate(input("P0"))).created).toBe(false);
  });
});

describe("status", () => {
  test("illegal transition new → won throws; allowed path works and writes events", async () => {
    const r = store("ws1");
    const { lead } = await r.createFromCandidate(input("P1"));
    await expect(r.updateStatus(lead.id, "won")).rejects.toBeInstanceOf(IllegalTransition);
    for (const s of ["contacted", "qualified", "proposal", "won"] as const) await r.updateStatus(lead.id, s);
    const full = await r.get(lead.id);
    expect(full!.status).toBe("won");
    expect(full!.events.map((e) => e.to ?? e.type)).toEqual([
      "created",
      "contacted",
      "qualified",
      "proposal",
      "won",
    ]);
    expect((await r.list({ status: ["won"] })).map((l) => l.id)).toEqual([lead.id]);
    expect(await r.list({ status: ["new"] })).toEqual([]);
  });

  test("a won or lost lead frees the property for a new active lead; reopening a lost one then conflicts", async () => {
    const r = store("ws1");
    const first = await r.createFromCandidate(input("P1"));
    await r.updateStatus(first.lead.id, "lost");
    const second = await r.createFromCandidate(input("P1"));
    expect(second.created).toBe(true);
    await expect(r.updateStatus(first.lead.id, "new")).rejects.toBeInstanceOf(ActiveLeadExists);
  });

  test("notes append to the timeline", async () => {
    const r = store("ws1");
    const { lead } = await r.createFromCandidate(input("P1"));
    await r.addNote(lead.id, "Called owner, voicemail");
    await r.addNote(lead.id, "Sent estimate");
    expect((await r.get(lead.id))!.notes.map((n) => n.body)).toEqual([
      "Called owner, voicemail",
      "Sent estimate",
    ]);
  });
});

describe("filters", () => {
  test("by roof age, open years, permit status and radius", async () => {
    const r = store("ws1");
    await r.createFromCandidate(
      input("OLDROOF", { roofAgeYears: 30, maxOpenDays: null, permitStatuses: [] }),
    );
    await r.createFromCandidate(
      input("LONGOPEN", { roofAgeYears: 8, maxOpenDays: 7 * 366, permitStatuses: ["open"] }),
    );
    await r.createFromCandidate(input("FAR", { lat: 26.3, lon: -80.1, permitStatuses: ["needs_review"] }));
    const ids = async (f: Parameters<typeof r.list>[0]) => (await r.list(f)).map((l) => l.propertyId).sort();
    expect(await ids({ minRoofAgeYears: 20 })).toEqual(["FAR", "OLDROOF"]);
    expect(await ids({ minOpenYears: 6.5 })).toEqual(["LONGOPEN"]);
    expect(await ids({ permitStatus: ["needs_review"] })).toEqual(["FAR"]);
    expect(await ids({ near: { center: FTL, radiusMiles: 5 } })).toEqual(["LONGOPEN", "OLDROOF"]);
    expect(await ids({ search: "longopen" })).toEqual(["LONGOPEN"]);
  });
});

describe("snapshot reconcile", () => {
  test("flags leads whose property vanished or whose signals changed, and never deletes", async () => {
    const r = store("ws1");
    await r.createFromCandidate(input("GONE"));
    await r.createFromCandidate(input("CHANGED"));
    await r.createFromCandidate(input("SAME"));
    const next: Record<string, LeadSignals> = {
      CHANGED: { ...signals(), roofAgeYears: 1, roofAgeBasis: "permit" },
      SAME: signals(),
    };
    const res = await r.reconcileWithSnapshot({
      cid: CID2,
      hasProperty: async (id) => id in next,
      signalsFor: async (id) => next[id] ?? null,
    });
    expect(res).toEqual({ checked: 3, markedStale: 2 });
    const leads = Object.fromEntries((await r.list()).map((l) => [l.propertyId, l]));
    expect(Object.keys(leads).sort()).toEqual(["CHANGED", "GONE", "SAME"]);
    expect(leads.GONE).toMatchObject({ stale: true, staleReason: `property GONE is not in run ${CID2}` });
    expect(leads.CHANGED.staleReason).toMatch(/roof age 22 → 1/);
    expect(leads.SAME.stale).toBe(false);
    expect((await r.list({ stale: true })).map((l) => l.propertyId).sort()).toEqual(["CHANGED", "GONE"]);
    // A second reconcile against the same run changes nothing.
    expect(
      (
        await r.reconcileWithSnapshot({
          cid: CID2,
          hasProperty: async (id) => id in next,
          signalsFor: async (id) => next[id] ?? null,
        })
      ).markedStale,
    ).toBe(0);
  });
});

describe("workspaces", () => {
  test("ensureWorkspace seeds demo leads once and is idempotent; seeds do not count against the cap", async () => {
    const seed = Array.from({ length: 6 }, (_, i) => input(`SEED${i}`));
    expect(await store.ensureWorkspace("ws1", seed)).toEqual({ created: true });
    expect(await store.ensureWorkspace("ws1", seed)).toEqual({ created: false });
    expect(await store("ws1").list()).toHaveLength(6);
    expect((await store("ws1").createFromCandidate(input("NEW"))).created).toBe(true);
  });
});
