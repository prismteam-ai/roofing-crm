import { describe, expect, it } from "vitest";
import { AgentAnswer, answerPins } from "../src/index.js";

const base = {
  sourceUrl: null,
  capturedAt: "2026-10-21T10:40:04.525Z",
  tableCid: "bafkreiaaaa",
  manifestCid: "bafkreiaaaa",
  asOf: "2026-10-21T10:40:04.525Z",
};

describe("answerPins", () => {
  it("returns one pin per property citation with coordinates, ordered by citation number", () => {
    const pins = answerPins({
      citations: [
        { ...base, id: 3, kind: "property", propertyCid: "c3", lat: 30.3, lon: -97.3 },
        { ...base, id: 1, kind: "property", propertyCid: "c1", lat: 30.1, lon: -97.1 },
        { ...base, id: 2, kind: "property", propertyCid: "c2" },
        {
          ...base,
          id: 4,
          kind: "permit",
          propertyCid: "c1",
          permitCid: "p",
          lat: 30.1,
          lon: -97.1,
        },
        { ...base, id: 5, kind: "run", lat: 30, lon: -97 },
      ],
    });
    expect(pins).toEqual([
      { n: 1, propertyCid: "c1", lat: 30.1, lon: -97.1 },
      { n: 3, propertyCid: "c3", lat: 30.3, lon: -97.3 },
    ]);
  });

  it("a permit-only answer pins each cited permit's property that carries coordinates", () => {
    const pins = answerPins({
      citations: [
        {
          ...base,
          id: 1,
          kind: "permit",
          propertyCid: "c1",
          permitCid: "p1",
          lat: 30.1,
          lon: -97.1,
        },
        {
          ...base,
          id: 2,
          kind: "permit",
          propertyCid: "c1",
          permitCid: "p2",
          lat: 30.1,
          lon: -97.1,
        },
        { ...base, id: 3, kind: "permit", propertyCid: "c2", permitCid: "p3" },
      ],
    });
    expect(pins).toEqual([{ n: 1, propertyCid: "c1", lat: 30.1, lon: -97.1 }]);
  });

  it("the new wire fields are optional: an answer without them still validates", () => {
    const minimal = {
      outcome: "empty_in_scope",
      claims: [],
      citations: [],
      plan: {
        intent: "find_properties",
        area: { kind: "place", query: "x", radiusMi: 5 },
        filters: {},
        slotSources: {},
        unsupported: [],
      },
      resultSetId: "t",
      counts: {
        matched: 0,
        shown: 0,
        excludedNoCoordinates: 0,
        excludedNoRoofDate: 0,
        truncated: false,
      },
      missing: [],
      trace: {
        traceId: "t",
        modelId: "m",
        promptVersion: "p",
        rankVersion: "r",
        toolSteps: 0,
        modelCalls: 0,
      },
    };
    expect(AgentAnswer.safeParse(minimal).success).toBe(true);
  });
});
