// T028 (B-09, Phase 4/US1): written and shown failing before apps/api/src/routers/agent.ts exists
// (TDD-first, constitution XXI). Per contracts/agent-api.md's `agent.confirmLead`: this is a
// plain, non-model-invoked tRPC mutation the UI calls after the rep taps "Create" on the
// confirmation card. It must call `requireLeadService(ctx).create(...)` — the exact same
// application-layer call `leads.create` already uses (apps/api/src/routers/leads.ts) — with
// `createdFrom: "agent"` and `sourceManifestCid` set to the manifest the property row itself came
// from (its own `sourceManifestCid` provenance — the same value the map path's `leads.create`
// sends), never a CID pinned in code. This test also ties to T029: the confirm-flow-bypass guard
// says that same `LeadService.create` call must never be reachable from
// `apps/api/src/services/agent/tools.ts` — only from this router handler.
import { TRPCError } from "@trpc/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import type { CreateLeadInput } from "../../src/services/leads.js";
import type { LeadService } from "../../src/services/leads.js";
import { router, createCallerFactory } from "../../src/trpc.js";
// Does not exist yet (T036) — this import is expected to fail module resolution, the correct
// TDD-first failure here, not a bad assertion in the test body below.
import { agentRouter } from "../../src/routers/agent.js";
import { resetUsageGuardForTest, setUsageGuardForTest } from "../../src/agent/usageGuard.js";
import { fakeUsageGuard, type FakeUsageGuardOptions } from "../support/fakeUsageGuard.js";

/** Task A's Run 2 full-county manifest (runId travis-full-run2-20261024). */
const RUN_2_MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
const TCAD_ID = "0208011301";
const PROPERTY_CID = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function property(sourceManifestCid: string = RUN_2_MANIFEST_CID): Provenanced<CrmProperty> {
  return {
    propertyCid: PROPERTY_CID,
    requestIdentifier: TCAD_ID,
    latitude: 30.4118,
    longitude: -97.7069,
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
    sourceManifestCid,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: PROPERTY_CID,
    runId: "travis-202609-permits-20261021t103516z",
  };
}

function permitRow(
  permitNumber: string,
  statusClass: "open" | "stalled" | "closed",
  openDays: number | null,
): Provenanced<CrmPermit> {
  return {
    propertyCid: PROPERTY_CID,
    permitCid: `bafkreip${permitNumber.replace(/\W/g, "").padEnd(52, "p")}`,
    permitNumber,
    statusClass,
    openDays,
  } as unknown as Provenanced<CrmPermit>;
}

class FakeLeadIndex implements LeadIndex {
  constructor(
    private readonly rows: Provenanced<CrmProperty>[],
    private readonly permits: Provenanced<CrmPermit>[] = [],
  ) {}
  async indexInfo() {
    return {
      manifestCid: RUN_2_MANIFEST_CID,
      propertyCount: this.rows.length,
      permitCount: 0,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(_query: SearchPropertiesQuery) {
    return this.rows;
  }
  async searchPermits(_query: SearchPermitsQuery): Promise<Provenanced<CrmPermit>[]> {
    return [];
  }
  async presentRequestIdentifiers(ids: readonly string[]) {
    return new Set(ids.filter((id) => this.rows.some((r) => r.requestIdentifier === id)));
  }
  async currentRunId() {
    return "travis-202609-permits-20261021t103516z";
  }
  async getProperty(propertyCid: string) {
    const found = this.rows.find((r) => r.propertyCid === propertyCid);
    return found === undefined ? null : { ...found, permits: this.permits };
  }
  async getPropertyByRequestIdentifier(requestIdentifier: string) {
    return this.rows.find((r) => r.requestIdentifier === requestIdentifier);
  }
}

/** A spy standing in for the real `LeadService` (the same DI seam `leads.ts`'s router already
 *  uses via `requireLeadService(ctx)` — never imported/instantiated by `agent.ts` itself). Only
 *  `create` is asserted on; the rest exist solely to satisfy the `LeadService` interface. */
function fakeLeadService(): LeadService & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async (input: CreateLeadInput, by: string) => ({
    ...input,
    leadKey: `${input.fips}:tcad:${input.requestIdentifier}`,
    status: "new" as const,
    assignee: by,
    eventSequence: 0,
  }));
  return {
    create,
    updateStatus: vi.fn(),
    addNote: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
  } as unknown as LeadService & { create: ReturnType<typeof vi.fn> };
}

/** By default the agent proposed TCAD_ID to rep-1 in thread-1 (CR finding 6b: confirmLead only
 *  confirms a tcadId the agent actually proposed in that thread). */
function ctx(
  rows: Provenanced<CrmProperty>[] = [property()],
  guardOptions: FakeUsageGuardOptions = { proposed: { "thread-1|rep-1": [TCAD_ID] } },
  permits: Provenanced<CrmPermit>[] = [],
) {
  const leadIndex = new FakeLeadIndex(rows, permits);
  const leadService = fakeLeadService();
  const fake = fakeUsageGuard(guardOptions);
  setUsageGuardForTest(fake.guard);
  return {
    leadService,
    fake,
    c: createCallerFactory(router({ agent: agentRouter }))({
      requestId: "req-agent-confirm-1",
      userId: "rep-1",
      leadIndex,
      leadService,
    }),
  };
}

afterEach(() => resetUsageGuardForTest());

function appCodeOf(error: unknown): string | undefined {
  return ((error as TRPCError).cause as { code?: string } | undefined)?.code;
}

describe("agent.confirmLead (T028)", () => {
  it("calls requireLeadService(ctx).create with createdFrom:'agent' and the property row's manifest CID", async () => {
    const { c, leadService } = ctx();

    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });

    expect(leadService.create).toHaveBeenCalledTimes(1);
    const [input, by] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input).toMatchObject({
      createdFrom: "agent",
      sourceManifestCid: RUN_2_MANIFEST_CID,
    });
    expect(by).toBe("rep-1");
  });

  it("saves the main permit's printed contractor and BBB state in the lead's signals", async () => {
    const printed = {
      ...permitRow("2025-100", "open", 200),
      contractorNameAsPrinted: "ACME ROOFING LLC",
      bbbStatus: "not_checked",
    } as unknown as Provenanced<CrmPermit>;
    const { c, leadService } = ctx([property()], undefined, [printed]);

    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });

    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.signals).toMatchObject({
      openPermitId: "2025-100",
      contractor: "ACME ROOFING LLC",
      bbbStatus: "not_checked",
      contractorRecorded: true,
    });
  });

  it("records that the main permit printed no contractor (flag set, no name)", async () => {
    const bare = {
      ...permitRow("2025-100", "open", 200),
      contractorNameAsPrinted: null,
      bbbStatus: null,
    } as unknown as Provenanced<CrmPermit>;
    const { c, leadService } = ctx([property()], undefined, [bare]);

    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });

    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.signals).not.toHaveProperty("contractor");
    expect(input.signals).toMatchObject({ contractorRecorded: true });
  });

  it("records the manifest the property row came from, not a CID pinned in code", async () => {
    // Any other valid CIDv1: proves the value is read from the row's own provenance.
    const otherManifestCid = "bafkreihkjrwg3dobc3emke5j5q2xk63746pxjhg6galvr5kibcseboc6ha";
    const { c, leadService } = ctx([property(otherManifestCid)]);

    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });

    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.sourceManifestCid).toBe(otherManifestCid);
  });

  // CR finding 6a: never invent coordinates. The map path (LeadCreateAction's toCreateInput)
  // offers no create at all for a property without coordinates, and the lead schema requires
  // lat/lon — so the agent path refuses with a typed NO_COORDINATES error instead of writing (0,0).
  it("refuses with NO_COORDINATES (and writes nothing) when the property has no coordinates", async () => {
    const { c, leadService } = ctx([{ ...property(), latitude: null, longitude: null }]);

    const error = await c.agent
      .confirmLead({ threadId: "thread-1", tcadId: TCAD_ID })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
    expect(appCodeOf(error)).toBe("NO_COORDINATES");
    expect(leadService.create).not.toHaveBeenCalled();
  });

  it("saves the same signals as the map: confidence plus the main permit (open or stalled, longest open)", async () => {
    const { c, leadService } = ctx([property()], undefined, [
      permitRow("2020-1", "closed", 900),
      permitRow("2021-2", "open", 120),
      permitRow("2022-3", "stalled", 400),
    ]);
    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });
    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.signals).toEqual({
      roofAgeYears: 28,
      roofAgeBasis: "built_year",
      roofAgeConfidence: "medium",
      openPermitId: "2022-3",
      openDays: 400,
      openPermitStatus: "stalled",
      contractorRecorded: true,
    });
  });

  it("saves no permit signals when the property has no open or stalled permit", async () => {
    const { c, leadService } = ctx([property()], undefined, [permitRow("2020-1", "closed", 900)]);
    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });
    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.signals).not.toHaveProperty("openPermitId");
    expect(input.signals).not.toHaveProperty("openDays");
    expect(input.signals).not.toHaveProperty("openPermitStatus");
    expect(input.signals.roofAgeConfidence).toBe("medium");
  });

  it("passes the property's real coordinates through, never a default", async () => {
    const { c, leadService } = ctx();
    await c.agent.confirmLead({ threadId: "thread-1", tcadId: TCAD_ID });
    const [input] = leadService.create.mock.calls[0] as [CreateLeadInput, string];
    expect(input.lat).toBe(30.4118);
    expect(input.lon).toBe(-97.7069);
  });

  // CR finding 6b: only a tcadId the agent proposed in this thread, to this rep.
  it("rejects a tcadId that was never proposed in this thread (NOT_PROPOSED), writing nothing", async () => {
    const { c, leadService } = ctx([property()], { proposed: { "thread-1|rep-1": ["other"] } });

    const error = await c.agent
      .confirmLead({ threadId: "thread-1", tcadId: TCAD_ID })
      .catch((e: unknown) => e);

    expect((error as TRPCError).code).toBe("FORBIDDEN");
    expect(appCodeOf(error)).toBe("NOT_PROPOSED");
    expect(leadService.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal from a different thread", async () => {
    const { c, leadService } = ctx();
    const error = await c.agent
      .confirmLead({ threadId: "thread-2", tcadId: TCAD_ID })
      .catch((e: unknown) => e);
    expect(appCodeOf(error)).toBe("NOT_PROPOSED");
    expect(leadService.create).not.toHaveBeenCalled();
  });

  // CR finding 6c: same per-user rate limit as agent.ask (its own window).
  it("applies the per-user rate limit (RATE_LIMITED) before any lookup or write", async () => {
    const { c, leadService, fake } = ctx([property()], {
      proposed: { "thread-1|rep-1": [TCAD_ID] },
      rateLimited: { retryAfterSec: 12 },
    });

    const error = await c.agent
      .confirmLead({ threadId: "thread-1", tcadId: TCAD_ID })
      .catch((e: unknown) => e);

    expect((error as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    expect(appCodeOf(error)).toBe("RATE_LIMITED");
    expect(fake.check).toHaveBeenCalledWith("rep-1", "confirm");
    expect(fake.wasProposed).not.toHaveBeenCalled();
    expect(leadService.create).not.toHaveBeenCalled();
  });
});
