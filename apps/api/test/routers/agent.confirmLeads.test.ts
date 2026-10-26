// Ask-in-map: `agent.confirmLeads` confirms several proposals from one thread in one call, reusing
// every check `agent.confirmLead` makes (proposed in this thread to this rep, NO_COORDINATES, the
// confirm rate limit) and building each lead server-side from the index row (createdFrom "agent").
// Per-item results: a duplicate is `alreadyLeads`, never a thrown error.
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import { resetUsageGuardForTest, setUsageGuardForTest } from "../../src/agent/usageGuard.js";
import { LeadAlreadyExistsError } from "../../src/leadErrors.js";
import { agentRouter } from "../../src/routers/agent.js";
import type { CreateLeadInput, LeadService } from "../../src/services/leads.js";
import { createCallerFactory, router } from "../../src/trpc.js";
import { fakeUsageGuard, type FakeUsageGuardOptions } from "../support/fakeUsageGuard.js";

const MANIFEST = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";

function property(
  tcadId: string,
  overrides: Partial<Provenanced<CrmProperty>> = {},
): Provenanced<CrmProperty> {
  const cid = `bafkrei${tcadId.padEnd(52, "a")}`;
  return {
    propertyCid: cid,
    requestIdentifier: tcadId,
    latitude: 30.41,
    longitude: -97.7,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 28,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: MANIFEST,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid,
    runId: "run",
    ...overrides,
  };
}

class FakeLeadIndex implements LeadIndex {
  constructor(private readonly rows: Provenanced<CrmProperty>[]) {}
  async indexInfo() {
    return {
      manifestCid: MANIFEST,
      propertyCount: this.rows.length,
      permitCount: 0,
      promotedAt: "x",
    };
  }
  async searchProperties(_q: SearchPropertiesQuery) {
    return this.rows;
  }
  async searchPermits(_q: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers(ids: readonly string[]) {
    return new Set(ids);
  }
  async currentRunId() {
    return "run";
  }
  async getProperty() {
    return null;
  }
  async getPropertyByRequestIdentifier(id: string) {
    return this.rows.find((r) => r.requestIdentifier === id);
  }
}

interface LeadServiceOptions {
  readonly duplicates?: readonly string[];
  readonly failing?: readonly string[];
  readonly delayMs?: number;
}

function fakeLeadService(options: LeadServiceOptions = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const create = vi.fn(async (input: CreateLeadInput, by: string) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise((r) => setTimeout(r, options.delayMs ?? 0));
      const leadKey = `${input.fips}:tcad:${input.requestIdentifier}`;
      if (options.duplicates?.includes(input.requestIdentifier)) {
        throw new LeadAlreadyExistsError(leadKey);
      }
      if (options.failing?.includes(input.requestIdentifier)) throw new Error("ddb down");
      return { ...input, leadKey, leadId: `lead-${input.requestIdentifier}`, assignee: by };
    } finally {
      inFlight -= 1;
    }
  });
  return {
    service: { create } as unknown as LeadService,
    create,
    maxInFlight: () => maxInFlight,
  };
}

const IDS = ["T1", "T2", "T3"];

function setup(
  opts: {
    rows?: Provenanced<CrmProperty>[];
    guard?: FakeUsageGuardOptions;
    lead?: LeadServiceOptions;
    userId?: string;
  } = {},
) {
  const fake = fakeUsageGuard(opts.guard ?? { proposed: { "thread-1|rep-1": IDS } });
  setUsageGuardForTest(fake.guard);
  const lead = fakeLeadService(opts.lead);
  const c = createCallerFactory(router({ agent: agentRouter }))({
    requestId: "req-confirm-many",
    userId: opts.userId ?? "rep-1",
    leadIndex: new FakeLeadIndex(opts.rows ?? IDS.map((id) => property(id))),
    leadService: lead.service,
  });
  return { c, fake, lead };
}

function appCodeOf(error: unknown): string | undefined {
  return ((error as TRPCError).cause as { code?: string } | undefined)?.code;
}

afterEach(() => resetUsageGuardForTest());

describe("agent.confirmLeads", () => {
  it("creates every proposed property server-side with createdFrom agent and per-item keys", async () => {
    const { c, lead } = setup();

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.created).toEqual(
      IDS.map((id) => ({ tcadId: id, leadKey: `${"48453"}:tcad:${id}`, leadId: `lead-${id}` })),
    );
    expect(result.alreadyLeads).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(lead.create).toHaveBeenCalledTimes(3);
    const [input, by] = lead.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input).toMatchObject({
      createdFrom: "agent",
      requestIdentifier: "T1",
      address: "TCAD T1",
      lat: 30.41,
      lon: -97.7,
      sourceManifestCid: MANIFEST,
    });
    expect(by).toBe("rep-1");
  });

  it("titles the lead with the stored street address, as the map does", async () => {
    const { c, lead } = setup({
      rows: [
        property("T1", { unnormalizedAddress: "  1100 Congress Ave  " }),
        property("T2", { unnormalizedAddress: "   " }),
        property("T3"),
      ],
    });

    await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    const inputs = lead.create.mock.calls.map((call) => call[0] as CreateLeadInput);
    expect(inputs.map((i) => i.address)).toEqual(["1100 Congress Ave", "TCAD T2", "TCAD T3"]);
    expect(inputs.map((i) => i.requestIdentifier)).toEqual(["T1", "T2", "T3"]);
  });

  it("fails an id that was not proposed in this thread without touching the rest", async () => {
    const { c, lead } = setup({ guard: { proposed: { "thread-1|rep-1": ["T1", "T3"] } } });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.created.map((r) => r.tcadId)).toEqual(["T1", "T3"]);
    expect(result.failed).toEqual([{ tcadId: "T2", code: "NOT_PROPOSED" }]);
    expect(lead.create).toHaveBeenCalledTimes(2);
  });

  it("reports a duplicate as alreadyLeads, never as an error", async () => {
    const { c } = setup({ lead: { duplicates: ["T2"] } });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.alreadyLeads).toEqual(["T2"]);
    expect(result.created.map((r) => r.tcadId)).toEqual(["T1", "T3"]);
    expect(result.failed).toEqual([]);
  });

  it("fails a property without coordinates with NO_COORDINATES and writes nothing for it", async () => {
    const rows = [
      property("T1"),
      property("T2", { latitude: null, longitude: null }),
      property("T3"),
    ];
    const { c, lead } = setup({ rows });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.failed).toEqual([{ tcadId: "T2", code: "NO_COORDINATES" }]);
    expect(lead.create).toHaveBeenCalledTimes(2);
  });

  it("fails an id missing from the index with NOT_FOUND, and a write error with CREATE_FAILED", async () => {
    const { c } = setup({ rows: [property("T1"), property("T3")], lead: { failing: ["T3"] } });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.failed).toEqual([
      { tcadId: "T2", code: "NOT_FOUND" },
      { tcadId: "T3", code: "CREATE_FAILED" },
    ]);
    expect(result.created.map((r) => r.tcadId)).toEqual(["T1"]);
  });

  it("applies the confirm rate limit once per batch, before any lookup or write", async () => {
    const { c, fake, lead } = setup({
      guard: { proposed: { "thread-1|rep-1": IDS }, rateLimited: { retryAfterSec: 9 } },
    });

    const error = await c.agent
      .confirmLeads({ threadId: "thread-1", tcadIds: IDS })
      .catch((e: unknown) => e);

    expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    expect(appCodeOf(error)).toBe("RATE_LIMITED");
    expect(fake.check).toHaveBeenCalledTimes(1);
    expect(fake.check).toHaveBeenCalledWith("rep-1", "confirm");
    expect(lead.create).not.toHaveBeenCalled();
  });

  it("does not let another user confirm a thread's proposals (owner mismatch)", async () => {
    const { c, lead } = setup({ userId: "rep-2" });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: IDS });

    expect(result.created).toEqual([]);
    expect(result.failed).toEqual(IDS.map((tcadId) => ({ tcadId, code: "NOT_PROPOSED" })));
    expect(lead.create).not.toHaveBeenCalled();
  });

  it("runs at most 3 creates at once", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const { c, lead } = setup({
      rows: ids.map((id) => property(id)),
      guard: { proposed: { "thread-1|rep-1": ids } },
      lead: { delayMs: 5 },
    });

    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: ids });

    expect(result.created).toHaveLength(10);
    expect(lead.maxInFlight()).toBe(3);
  });

  it("de-duplicates repeated ids and validates 1..25", async () => {
    const { c, lead } = setup();
    const result = await c.agent.confirmLeads({ threadId: "thread-1", tcadIds: ["T1", "T1"] });
    expect(result.created).toHaveLength(1);
    expect(lead.create).toHaveBeenCalledTimes(1);

    await expect(c.agent.confirmLeads({ threadId: "thread-1", tcadIds: [] })).rejects.toThrow();
    const many = Array.from({ length: 26 }, (_, i) => `X${i}`);
    await expect(c.agent.confirmLeads({ threadId: "thread-1", tcadIds: many })).rejects.toThrow();
  });
});

describe("agent.confirmLead — duplicate", () => {
  it("maps an already-existing lead to CONFLICT / ALREADY_EXISTS (same as leads.create), not a 500", async () => {
    const { c } = setup({ lead: { duplicates: ["T1"] } });

    const error = await c.agent
      .confirmLead({ threadId: "thread-1", tcadId: "T1" })
      .catch((e: unknown) => e);

    expect((error as TRPCError).code).toBe("CONFLICT");
    expect(appCodeOf(error)).toBe("ALREADY_EXISTS");
  });
});
