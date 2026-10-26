// Shared fixtures for the agent turn tests (`agent/composeAnswer.ts`'s `runAsk`): row builders, an
// in-memory `LeadIndex` that also serves permits, a scripted mock model, and a spy place resolver.
// Row values are copied from the A-03 fixture shape agent.ask.test.ts already uses.
import { MockLanguageModelV4 } from "ai/test";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import type { PlaceResolution, PlaceResolver } from "@crm/shared";
import type {
  LeadIndex,
  SearchPermitsQuery,
  SearchPropertiesQuery,
} from "../../src/adapters/duckDbParquet.js";
import type { LeadRepo } from "../../src/adapters/leadRepo.js";

export const MANIFEST_CID = "bafkreife3vk3cgcod3v6tue2xes3hvl2vndqoshbhrhsnjtriskihpcute";
export const PROPERTY_CID_A = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const PROPERTY_CID_B = "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const PERMIT_CID_P = "bafkreipppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

export function property(
  overrides: Partial<Provenanced<CrmProperty>> = {},
): Provenanced<CrmProperty> {
  return {
    propertyCid: PROPERTY_CID_A,
    requestIdentifier: "R-0001",
    latitude: 30.4418,
    longitude: -97.6069,
    coordinateSource: "gis_centroid",
    propertyType: "single_family",
    propertyUsageType: "residential",
    roofAgeYears: 32,
    roofAgeBasis: "built_year",
    roofAgeConfidence: "medium",
    isLongTenure: null,
    tenureBasis: null,
    ownerName: null,
    ownerKind: null,
    ownerAreaClass: null,
    ownerIsOutOfArea: null,
    sourceManifestCid: MANIFEST_CID,
    missingReasons: [],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: overrides.propertyCid ?? PROPERTY_CID_A,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

export function permit(overrides: Partial<Provenanced<CrmPermit>> = {}): Provenanced<CrmPermit> {
  return {
    propertyCid: PROPERTY_CID_A,
    permitCid: PERMIT_CID_P,
    jurisdiction: "Pflugerville",
    permitNumber: "2019-001234",
    improvementType: "roofing",
    improvementAction: "replace",
    improvementStatus: "Issued",
    statusClass: "open",
    issueDate: "2019-03-04",
    finalDate: null,
    permitCloseDate: null,
    finalInspectionDate: null,
    openDays: 2790,
    contractorResolution: null,
    contractorCompanyCid: null,
    contractorNameAsPrinted: null,
    bbbStatus: null,
    bbbStatusReason: null,
    bbbUrl: null,
    sourceManifestCid: MANIFEST_CID,
    missingReasons: [{ field: "contractor", reason: "contractor_unresolved" }],
    capturedAt: "2026-10-21T10:40:04.525Z",
    cid: overrides.permitCid ?? PERMIT_CID_P,
    runId: "travis-202609-permits-20261021t103516z",
    ...overrides,
  };
}

/** Serves properties and permits from memory. `searchProperties` honours `roofAgeMinYears` (the
 *  only filter these tests use) and ignores the geometry: every fixture row is "in the radius". */
export class FakeLeadIndex implements LeadIndex {
  readonly searchPropertiesCalls: SearchPropertiesQuery[] = [];
  readonly searchPermitsCalls: SearchPermitsQuery[] = [];
  getPropertyCalls = 0;
  constructor(
    private readonly properties: Provenanced<CrmProperty>[],
    private readonly permits: Provenanced<CrmPermit>[] = [],
    private readonly propertyCount = properties.length,
  ) {}
  async indexInfo() {
    return {
      manifestCid: MANIFEST_CID,
      propertyCount: this.propertyCount,
      permitCount: this.permits.length,
      promotedAt: "2026-10-21T10:35:16Z",
    };
  }
  async searchProperties(query: SearchPropertiesQuery) {
    this.searchPropertiesCalls.push(query);
    const placed = this.properties.filter((p) => p.latitude !== null && p.longitude !== null);
    const min = query.roofAgeMinYears;
    const aged =
      min === undefined
        ? placed
        : placed.filter((p) => p.roofAgeYears !== null && p.roofAgeYears >= min);
    if (query.permitStatusClass === undefined && query.permitOpenDaysMin === undefined) return aged;
    // The permit condition, as the SQL semi-join applies it: on the SAME permit.
    return aged.filter((p) =>
      this.permits.some(
        (m) =>
          m.propertyCid === p.propertyCid &&
          (query.permitStatusClass === undefined ||
            (m.statusClass !== null && query.permitStatusClass.includes(m.statusClass))) &&
          (query.permitOpenDaysMin === undefined || (m.openDays ?? -1) >= query.permitOpenDaysMin),
      ),
    );
  }
  async searchPermits(query: SearchPermitsQuery) {
    this.searchPermitsCalls.push(query);
    return this.permits.filter(
      (p) =>
        (query.propertyCids === undefined || query.propertyCids.includes(p.propertyCid)) &&
        (query.permitNumber === undefined || p.permitNumber === query.permitNumber),
    );
  }
  async presentRequestIdentifiers() {
    return new Set<string>();
  }
  async currentRunId() {
    return "travis-202609-permits-20261021t103516z";
  }
  async getProperty(propertyCid: string) {
    this.getPropertyCalls += 1;
    const found = this.properties.find((r) => r.propertyCid === propertyCid);
    if (found === undefined) return null;
    return { ...found, permits: this.permits.filter((p) => p.propertyCid === propertyCid) };
  }
  async getPropertyByRequestIdentifier(requestIdentifier: string) {
    return this.properties.find((r) => r.requestIdentifier === requestIdentifier);
  }
}

/** A model that answers each `doGenerate` call with the next scripted text, and throws if called
 *  more often than scripted (so an extra compose call fails the test loudly). */
export function scriptedModel(texts: readonly string[]): MockLanguageModelV4 {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const text = texts[call];
      call += 1;
      if (text === undefined) throw new Error(`unexpected model call #${call}`);
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

export function planText(plan: Record<string, unknown>): string {
  return JSON.stringify({
    filters: {},
    slotSources: {},
    unsupported: [],
    ...plan,
  });
}

/** Wraps a real or fixed resolver and counts calls (finding 2: some intents must never resolve). */
export function spyResolver(inner: PlaceResolver | PlaceResolution): PlaceResolver & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    async resolve(text: string) {
      calls.push(text);
      return "resolve" in inner ? inner.resolve(text) : inner;
    },
  };
}

/** `proposeLeads` reads `leadRepo.get` only; nothing here is a lead yet. */
export function emptyLeadRepo(): LeadRepo {
  return {
    async get() {
      return null;
    },
  } as unknown as LeadRepo;
}
