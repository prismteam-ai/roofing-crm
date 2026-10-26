// T025 (B-09, Phase 4/US1): failing-first unit test for the server-side citation verifier
// (ADR-06 §5, docs/decisions/0000-agent-architecture.md). `apps/api/src/services/agent/
// verifyCitations.ts` does not exist yet when this test is first run — it must fail on import,
// then T031 makes it pass.
import { describe, expect, it } from "vitest";
import type { AgentAnswer } from "@crm/shared";
import type { LeadIndex } from "../../../src/adapters/duckDbParquet.js";
import { verifyCitations } from "../../../src/services/agent/verifyCitations.js";

const MANIFEST_CID = "bafkreiasycmsr2qdlxqcfg3yc2conpn3jxmohz7gs55hkseipplhpqsk5i";
const OTHER_MANIFEST_CID = "bafkreiotherotherotherotherotherotherotherotherotherotherot";
const PROPERTY_CID_A = "bafkreiaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PROPERTY_CID_B = "bafkreibbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

type Citation = AgentAnswer["citations"][number];

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    id: 1,
    kind: "property",
    propertyCid: PROPERTY_CID_A,
    sourceUrl: null,
    capturedAt: "2026-10-21T10:40:04.525Z",
    tableCid: MANIFEST_CID,
    manifestCid: MANIFEST_CID,
    asOf: "2026-10-21T10:35:16Z",
    ...overrides,
  };
}

const COUNTS: AgentAnswer["counts"] = {
  matched: 3,
  shown: 3,
  excludedNoCoordinates: 0,
  excludedNoRoofDate: 0,
  truncated: false,
};

/** Only `getProperty` matters to this verifier; everything else is unreachable from it. */
function fakeLeadIndex(present: Record<string, string>): LeadIndex {
  return {
    indexInfo: () => {
      throw new Error("not used by verifyCitations");
    },
    searchProperties: () => {
      throw new Error("not used by verifyCitations");
    },
    searchPermits: () => {
      throw new Error("not used by verifyCitations");
    },
    presentRequestIdentifiers: () => {
      throw new Error("not used by verifyCitations");
    },
    currentRunId: () => {
      throw new Error("not used by verifyCitations");
    },
    getPropertyByRequestIdentifier: () => {
      throw new Error("not used by verifyCitations");
    },
    async getProperty(propertyCid: string) {
      const manifestCid = present[propertyCid];
      if (manifestCid === undefined) return null;
      return {
        propertyCid,
        sourceManifestCid: manifestCid,
        permits: [],
      } as unknown as Awaited<ReturnType<LeadIndex["getProperty"]>>;
    },
  };
}

describe("verifyCitations", () => {
  it("keeps a claim whose citationId is in this turn's tool results and resolves live", async () => {
    const leadIndex = fakeLeadIndex({ [PROPERTY_CID_A]: MANIFEST_CID });
    const result = await verifyCitations({
      claims: [{ text: "123 Main St has a roof over 15 years old.", citationIds: [1] }],
      citations: [citation({ id: 1 })],
      toolResultCitationIds: new Set([1]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });

    expect(result.usedTemplate).toBe(false);
    expect(result.droppedCount).toBe(0);
    expect(result.claims).toEqual([
      { text: "123 Main St has a roof over 15 years old.", citationIds: [1] },
    ]);
  });

  it("strips a claim whose citationId was never in this turn's tool results (a planted/fabricated id)", async () => {
    const leadIndex = fakeLeadIndex({
      [PROPERTY_CID_A]: MANIFEST_CID,
      [PROPERTY_CID_B]: MANIFEST_CID,
    });
    const result = await verifyCitations({
      claims: [
        { text: "A real, cited claim.", citationIds: [1] },
        { text: "A fabricated claim citing an id never handed to the model.", citationIds: [99] },
      ],
      citations: [citation({ id: 1, propertyCid: PROPERTY_CID_A })],
      // id 99 is not in this set at all — the model invented it.
      toolResultCitationIds: new Set([1]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });

    expect(result.usedTemplate).toBe(false);
    expect(result.droppedCount).toBe(1);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.text).toBe("A real, cited claim.");
  });

  it("strips a claim whose citation resolves in tool results but no longer resolves in the live index (stale/mismatched manifest)", async () => {
    // The citation claims MANIFEST_CID, but the live index now says this property last came
    // from a different manifest — the batch getProperty check catches this even though the id
    // itself was genuinely produced by a tool call this turn.
    const leadIndex = fakeLeadIndex({ [PROPERTY_CID_A]: OTHER_MANIFEST_CID });
    const result = await verifyCitations({
      claims: [{ text: "Stale claim.", citationIds: [1] }],
      citations: [citation({ id: 1, propertyCid: PROPERTY_CID_A, manifestCid: MANIFEST_CID })],
      toolResultCitationIds: new Set([1]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });

    expect(result.droppedCount).toBe(1);
    expect(result.claims).toEqual([]);
  });

  it("falls back to a deterministic counts-based template when no claim survives, citing only verified ids", async () => {
    const leadIndex = fakeLeadIndex({ [PROPERTY_CID_A]: MANIFEST_CID });
    const result = await verifyCitations({
      claims: [{ text: "A fabricated claim.", citationIds: [99] }],
      citations: [citation({ id: 1, propertyCid: PROPERTY_CID_A })],
      toolResultCitationIds: new Set([1]), // id 1 is verified-available, but no claim cited it
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });

    expect(result.usedTemplate).toBe(true);
    expect(result.droppedCount).toBe(1);
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.citationIds).toEqual([1]);
    expect(result.claims[0]?.text).toContain(String(COUNTS.matched));
  });

  it("the template itself has no claims when there is nothing verified left to cite (never an uncited 'answered')", async () => {
    const leadIndex = fakeLeadIndex({});
    const result = await verifyCitations({
      claims: [{ text: "A fabricated claim.", citationIds: [99] }],
      citations: [],
      toolResultCitationIds: new Set(),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: { ...COUNTS, matched: 0, shown: 0 },
    });

    expect(result.usedTemplate).toBe(true);
    expect(result.claims).toEqual([]);
  });

  it("a non-property citation (e.g. kind 'run') only needs tool-result membership, no getProperty call", async () => {
    const leadIndex = fakeLeadIndex({});
    const result = await verifyCitations({
      claims: [{ text: "This run covers Travis County.", citationIds: [2] }],
      citations: [{ ...citation({ id: 2 }), kind: "run", propertyCid: undefined }],
      toolResultCitationIds: new Set([2]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });

    expect(result.usedTemplate).toBe(false);
    expect(result.droppedCount).toBe(0);
    expect(result.claims).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// B-09 review findings 6 + 11 (CR-B-09 rows 8/11/17): permit citations are verified against the
// live index like property citations, and claim *text* is checked against the cited rows.
// ---------------------------------------------------------------------------------------------

const PERMIT_CID_P = "bafkreipppppppppppppppppppppppppppppppppppppppppppppppppppppppppp";

/** A LeadIndex whose `getProperty` returns the property with the given permits attached. */
function fakeIndexWithPermits(
  propertyManifest: string,
  permits: Array<{ permitCid: string; sourceManifestCid: string }>,
): LeadIndex {
  const base = fakeLeadIndex({});
  return {
    ...base,
    async getProperty(propertyCid: string) {
      if (propertyCid !== PROPERTY_CID_A) return null;
      return {
        propertyCid,
        sourceManifestCid: propertyManifest,
        permits,
      } as unknown as Awaited<ReturnType<LeadIndex["getProperty"]>>;
    },
  };
}

function permitCitation(overrides: Partial<Citation> = {}): Citation {
  return citation({ id: 5, kind: "permit", permitCid: PERMIT_CID_P, ...overrides });
}

describe("verifyCitations: permit citations are checked against the index (finding 6)", () => {
  it("keeps a permit citation whose permit is in the promoted run under the same manifest", async () => {
    const leadIndex = fakeIndexWithPermits(MANIFEST_CID, [
      { permitCid: PERMIT_CID_P, sourceManifestCid: MANIFEST_CID },
    ]);
    const result = await verifyCitations({
      claims: [{ text: "One open permit.", citationIds: [5] }],
      citations: [permitCitation()],
      toolResultCitationIds: new Set([5]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });
    expect(result.droppedCount).toBe(0);
    expect(result.verifiedCitationIds).toEqual(new Set([5]));
  });

  it("drops a permit citation whose permit is not (or no longer) on that property in the index", async () => {
    const leadIndex = fakeIndexWithPermits(MANIFEST_CID, []);
    const result = await verifyCitations({
      claims: [{ text: "One open permit.", citationIds: [5] }],
      citations: [permitCitation()],
      toolResultCitationIds: new Set([5]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });
    expect(result.droppedCount).toBe(1);
    expect(result.verifiedCitationIds.size).toBe(0);
  });

  it("drops a permit citation from a different manifest", async () => {
    const leadIndex = fakeIndexWithPermits(MANIFEST_CID, [
      { permitCid: PERMIT_CID_P, sourceManifestCid: OTHER_MANIFEST_CID },
    ]);
    const result = await verifyCitations({
      claims: [{ text: "One open permit.", citationIds: [5] }],
      citations: [permitCitation()],
      toolResultCitationIds: new Set([5]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });
    expect(result.droppedCount).toBe(1);
  });

  it("drops a run citation that names a different manifest than this turn's", async () => {
    const result = await verifyCitations({
      claims: [{ text: "This run covers Travis County.", citationIds: [2] }],
      citations: [
        {
          ...citation({ id: 2, manifestCid: OTHER_MANIFEST_CID }),
          kind: "run",
          propertyCid: undefined,
        },
      ],
      toolResultCitationIds: new Set([2]),
      leadIndex: fakeLeadIndex({}),
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
    });
    expect(result.droppedCount).toBe(1);
  });
});

describe("verifyCitations: claim text is checked against the cited rows (finding 11)", () => {
  it("drops a claim citing a real row but stating a wrong roof age, and counts its citation unverified", async () => {
    const leadIndex = fakeLeadIndex({ [PROPERTY_CID_A]: MANIFEST_CID });
    const result = await verifyCitations({
      claims: [
        { text: "R-0001 has a 32-year-old roof.", citationIds: [1] },
        { text: "R-0001 has a 45-year-old roof.", citationIds: [2] },
      ],
      citations: [citation({ id: 1 }), citation({ id: 2 })],
      toolResultCitationIds: new Set([1, 2]),
      leadIndex,
      manifestCid: MANIFEST_CID,
      counts: COUNTS,
      textFacts: {
        allowedNumbers: [COUNTS.matched],
        turnIdentifiers: ["R-0001", PROPERTY_CID_A],
        forCitation: () => ({ numbers: [32], identifiers: ["R-0001", PROPERTY_CID_A] }),
      },
    });
    expect(result.claims.map((c) => c.text)).toEqual(["R-0001 has a 32-year-old roof."]);
    expect(result.droppedCount).toBe(1);
    expect(result.droppedForText).toBe(1);
    // id 2 resolved in the index, but its only claim failed the text check: not verified.
    expect(result.verifiedCitationIds).toEqual(new Set([1]));
  });
});
