// B-09 fixer round: the template's "showing the top N" is the shown-row count, a roof-age default
// is not applied to a question that is not about roofs, and tenure is answered at the one cutoff
// the index stores (more than 10 years), with a note when the rep asked for another number.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import {
  dropDefaultRoofFilter,
  runAsk,
  servedIndexHasTenureYears,
  PLAN_SYSTEM_PROMPT,
  type RunAskInput,
} from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import type { QueryPlan } from "@crm/shared";
import {
  FakeLeadIndex,
  emptyLeadRepo,
  permit,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const NOT_JSON = "not json";

function cid(letter: string): string {
  return `bafkrei${letter.repeat(52)}`;
}

function ask(
  question: string,
  texts: readonly string[],
  index: FakeLeadIndex,
  extra: Partial<RunAskInput> = {},
) {
  const run = runAsk({
    model: scriptedModel(texts),
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question,
    traceId: "t",
    obs,
    ...extra,
  });
  return run;
}

const five = ["a", "b", "c", "d", "e"].map((l, i) =>
  property({ propertyCid: cid(l), requestIdentifier: `R-000${i}`, roofAgeYears: 30 + i }),
);

describe("template text uses the shown-row count, not the cited-row count", () => {
  it("properties: 5 rows shown, 3 cited -> 'showing the top 5'", async () => {
    const answer = await ask(
      "Which properties near Pflugerville have roofs older than 15 years?",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { roofAgeMinYears: 15 },
          slotSources: { roofAgeMinYears: "stated" },
        }),
        NOT_JSON,
      ],
      new FakeLeadIndex(five),
    );
    expect(answer.counts.shown).toBe(5);
    expect(answer.citations).toHaveLength(3);
    expect(answer.claims[0]?.text).toContain("showing the top 5");
    expect(answer.claims[0]?.text).not.toContain("showing the top 3");
  });

  it("permits: shown 4, cited 3 -> 'showing the top 4'", async () => {
    const permits = ["a", "b", "c", "d"].map((l) =>
      permit({ propertyCid: cid(l), permitCid: cid(l.toUpperCase()), permitNumber: `P-${l}` }),
    );
    const props = ["a", "b", "c", "d"].map((l, i) =>
      property({ propertyCid: cid(l), requestIdentifier: `R-${i}` }),
    );
    const answer = await ask(
      "Show me open roofing permits near Pflugerville",
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { statusClass: ["open"] },
          slotSources: { statusClass: "stated" },
        }),
        NOT_JSON,
      ],
      new FakeLeadIndex(props, permits),
    );
    expect(answer.counts.shown).toBe(4);
    expect(answer.claims[0]?.text).toContain("showing the top 4");
  });
});

describe("roof-age default only for roof questions", () => {
  const base: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Austin", radiusMi: 2 },
    filters: { roofAgeMinYears: 15, tenureYearsMin: 10 },
    slotSources: { roofAgeMinYears: "default", tenureYearsMin: "stated" },
    unsupported: [],
  };

  it("drops a defaulted roof filter when the question never mentions roofs", () => {
    const out = dropDefaultRoofFilter(
      base,
      "Which properties within 2 miles of Austin haven't changed owners in 10 years?",
    );
    expect(out.filters).toEqual({ tenureYearsMin: 10 });
    expect(out.slotSources).toEqual({ tenureYearsMin: "stated" });
  });

  it("keeps it for a roof question, and always keeps a stated one", () => {
    expect(dropDefaultRoofFilter(base, "Which Austin roofs are old?").filters.roofAgeMinYears).toBe(
      15,
    );
    const stated = {
      ...base,
      slotSources: { ...base.slotSources, roofAgeMinYears: "stated" as const },
    };
    expect(
      dropDefaultRoofFilter(stated, "owners unchanged in 10 years").filters.roofAgeMinYears,
    ).toBe(15);
  });

  it("end to end: the search for a tenure question carries no roof filter", async () => {
    const index = new FakeLeadIndex([property({ isLongTenure: true })]);
    await ask(
      "Which properties within 2 miles of Austin haven't changed owners in 10 years or more?",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Austin", radiusMi: 2 },
          filters: { roofAgeMinYears: 15, tenureYearsMin: 10 },
          slotSources: { roofAgeMinYears: "default", tenureYearsMin: "stated", radiusMi: "stated" },
        }),
        NOT_JSON,
      ],
      index,
    );
    expect(index.searchPropertiesCalls[0]).not.toHaveProperty("roofAgeMinYears");
  });
});

describe("tenure is answered at more than 10 years", () => {
  const run = (tenure: number) =>
    ask(
      `Which properties near Pflugerville haven't changed owners in ${tenure} years?`,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { tenureYearsMin: tenure },
          slotSources: { tenureYearsMin: "stated" },
        }),
        NOT_JSON,
      ],
      new FakeLeadIndex([property({ isLongTenure: true })]),
    );

  it("a request for 15 years gets the honest note, and the claim survives verification", async () => {
    const answer = await run(15);
    expect(answer.claims[0]?.text).toMatch(/tenure is answered as more than 10 years/i);
  });

  it("an index that stores tenureYears is exact, so no cutoff note appears", async () => {
    const withColumn = property({ isLongTenure: true, tenureYears: 22 });
    const answer = await ask(
      "Which properties near Pflugerville haven't changed owners in 15 years?",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { tenureYearsMin: 15 },
          slotSources: { tenureYearsMin: "stated" },
        }),
        NOT_JSON,
      ],
      new FakeLeadIndex([withColumn]),
    );
    expect(answer.claims[0]?.text).not.toMatch(/tenure is answered/i);
  });

  it("a request for more than 10 years (minimum 11) gets no note", async () => {
    const answer = await run(11);
    expect(answer.claims[0]?.text).not.toMatch(/tenure is answered/i);
  });

  it("a request for 10 years on an index without the column gets the note, as it is answered at more than 10", async () => {
    const answer = await run(10);
    expect(answer.claims[0]?.text).toMatch(/tenure is answered as more than 10 years/i);
  });

  it("the prompt maps over 10 years to 11 and names the roof-age default", () => {
    expect(PLAN_SYSTEM_PROMPT).toMatch(/"over 10 years" is 11/);
    expect(PLAN_SYSTEM_PROMPT).toContain('"filters":{"tenureYearsMin":11,');
    expect(PLAN_SYSTEM_PROMPT).toContain("roofAgeMinYears to 15 only");
  });

  it("servedIndexHasTenureYears needs a number: a null tenureYears is not evidence of the column", () => {
    expect(servedIndexHasTenureYears({ properties: [property({ tenureYears: null })] })).toBe(
      false,
    );
    expect(servedIndexHasTenureYears({ properties: [property()] })).toBe(false);
    expect(servedIndexHasTenureYears({ properties: [property({ tenureYears: 22 })] })).toBe(true);
  });
});
