// B-09 GAP-2: place recognition no longer depends on the plan model getting area.query right.
// The mocked model returns the kinds of bad plans the Run 2 harness hit: its pass 2 diagnostic
// (tests/agent/results/run2-pass2-diagnostic-2026-10-25.json) shows G3 and G4 ending as
// needs_clarification after two model calls with area.query holding the question text, which is
// what an unparseable plan (code fence, prose around the JSON, an area.query over the schema's
// 80 characters) produces. The exact model replies were not logged, so these are the shapes that
// cause that outcome, not copies.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import { repairPlanFromQuestion, runAsk, type RunAskInput } from "../../src/agent/composeAnswer.js";
import {
  extractJsonObject,
  narrowedPlace,
  scanQuestionForArea,
  scanQuestionForRadius,
} from "../../src/agent/placeScan.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  emptyLeadRepo,
  permit,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");

// A compose reply that is not JSON: the deterministic template answers (one plan call + one compose
// call in total, never a plan repair call).
const NOT_JSON = "not json";

const G3 = "Show me open roofing permits older than five years within five miles of Manor";
const G4 =
  "Which homes near Lakeway haven't changed owners in 10+ years and have owners outside the area?";

function ask(question: string, texts: readonly string[], extra: Partial<RunAskInput> = {}) {
  const model = scriptedModel(texts);
  const index = new FakeLeadIndex([property()], [permit()]);
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question,
    traceId: "t",
    obs,
    ...extra,
  });
  return { run, model, index };
}

describe("scanQuestionForArea", () => {
  it("finds the assessment's places, case-insensitively, with word boundaries", () => {
    expect(scanQuestionForArea(G3)).toEqual({ kind: "place", query: "Manor" });
    expect(scanQuestionForArea(G4)).toEqual({ kind: "place", query: "Lakeway" });
    expect(scanQuestionForArea("roofs within 5 miles of pflugerville please")).toEqual({
      kind: "place",
      query: "Pflugerville",
    });
    expect(
      scanQuestionForArea("Which properties in Travis County have roofs older than 15 years?"),
    ).toBeUndefined();
    expect(scanQuestionForArea("the manorial estates")).toBeUndefined();
  });

  it("prefers the longest name and the one after 'of' or 'near'", () => {
    expect(scanQuestionForArea("homes near West Lake Hills")?.query).toBe("West Lake Hills");
    expect(
      scanQuestionForArea("compare Austin with roofs within 3 miles of Round Rock")?.query,
    ).toBe("Round Rock");
  });

  it("reads ZIP codes: labelled, bare Travis codes, and an out-of-county code after 'ZIP'", () => {
    expect(scanQuestionForArea("How many roofs older than 20 years in ZIP 78701?")).toEqual({
      kind: "zip",
      query: "78701",
    });
    expect(scanQuestionForArea("roofs in 78701")).toEqual({ kind: "zip", query: "78701" });
    expect(
      scanQuestionForArea("How many properties have roofs older than 40 years in ZIP 99999?"),
    ).toEqual({ kind: "zip", query: "99999" });
    expect(scanQuestionForArea("permit 12345 is stalled")).toBeUndefined();
  });

  it("does not match a narrowed place: 'downtown Austin' is not Austin", () => {
    expect(
      scanQuestionForArea("roofs older than 20 years within 3 miles of downtown Austin"),
    ).toBeUndefined();
    expect(narrowedPlace("downtown Austin")).toBe("Austin");
    expect(narrowedPlace("Austin")).toBeUndefined();
    expect(narrowedPlace("downtown Atlantis")).toBeUndefined();
  });
});

describe("scanQuestionForRadius and extractJsonObject", () => {
  it("reads stated radii, rejects out-of-range ones", () => {
    expect(scanQuestionForRadius(G3)).toEqual({ radiusMi: 5 });
    expect(scanQuestionForRadius("within 2.5 mi of Manor")).toEqual({ radiusMi: 2.5 });
    expect(scanQuestionForRadius("within 3 miles of Austin")).toEqual({ radiusMi: 3 });
    expect(scanQuestionForRadius("older than five years")).toBeUndefined();
    expect(scanQuestionForRadius("within 90 miles")).toBeUndefined();
  });

  it("takes the object out of a fence or surrounding prose", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonObject('Here is the plan: {"a":1} Hope that helps.')).toBe('{"a":1}');
    expect(extractJsonObject("no json")).toBe("no json");
  });
});

describe("repairPlanFromQuestion", () => {
  const base = {
    intent: "find_permits" as const,
    area: { kind: "place" as const, query: "", radiusMi: 5 },
    filters: {},
    slotSources: {},
    unsupported: [],
  };

  it("fills a blank area from the question and marks it stated", () => {
    const { plan, repairs } = repairPlanFromQuestion(base, G3);
    expect(plan.area.query).toBe("Manor");
    expect(plan.slotSources.area).toBe("stated");
    expect(repairs).toHaveLength(1);
  });

  it("replaces an area.query that is the sentence, but leaves a real place alone", () => {
    expect(
      repairPlanFromQuestion({ ...base, area: { ...base.area, query: G3.slice(0, 40) } }, G3).plan
        .area.query,
    ).toBe("Manor");
    const kept = repairPlanFromQuestion({ ...base, area: { ...base.area, query: "Lakeway" } }, G3);
    expect(kept.plan.area.query).toBe("Lakeway");
    expect(kept.repairs).toEqual([]);
  });

  it("leaves a typo or a narrowed place to the resolver's confidence bands", () => {
    const typo = repairPlanFromQuestion(
      { ...base, area: { ...base.area, query: "Pflugervile" } },
      "roofs near Pflugervile and Manor",
    );
    expect(typo.plan.area.query).toBe("Pflugervile");
    const downtown = repairPlanFromQuestion(
      { ...base, area: { ...base.area, query: "downtown Austin" } },
      "roofs within 3 miles of downtown Austin",
    );
    expect(downtown.plan.area.query).toBe("downtown Austin");
  });

  it("never touches an inherited area, coverage, or a lookup", () => {
    const inherited = { ...base, slotSources: { area: "inherited" as const } };
    expect(repairPlanFromQuestion(inherited, G3).repairs).toEqual([]);
    expect(repairPlanFromQuestion({ ...base, intent: "coverage" }, G3).repairs).toEqual([]);
  });

  it("takes a radius the rep stated when the plan did not mark one stated", () => {
    const { plan } = repairPlanFromQuestion(
      {
        ...base,
        area: { kind: "place", query: "Manor", radiusMi: 5 },
        slotSources: { radiusMi: "default" },
      },
      "permits within 3 miles of Manor",
    );
    expect(plan.area.radiusMi).toBe(3);
    expect(plan.slotSources.radiusMi).toBe("stated");
  });
});

describe("runAsk with the bad plans the harness hit (GAP-2)", () => {
  const goodTail = {
    filters: { statusClass: ["open"], openYearsMin: 5 },
    slotSources: { statusClass: "stated" },
  };

  it("G3: area.query holding the whole question (over 80 characters) is repaired to Manor with no plan repair call", async () => {
    const sentence = `${G3} -- please include everything you can find for this area`;
    const { run, model } = ask(G3, [
      planText({
        intent: "find_permits",
        area: { kind: "place", query: sentence, radiusMi: 5 },
        ...goodTail,
      }),
      NOT_JSON,
    ]);
    const answer = await run;
    expect(answer.outcome).not.toBe("needs_clarification");
    expect(answer.plan.area.resolved?.name).toBe("Manor city");
    expect(answer.trace.planRepairs?.[0]).toContain('place "Manor"');
    expect(model.doGenerateCalls.length).toBe(2);
  });

  it("G4: a code-fenced reply parses on the first call, and a blank area is taken from the question", async () => {
    const fenced =
      "```json\n" +
      JSON.stringify({
        intent: "find_properties",
        area: { kind: "place", query: "", radiusMi: 5 },
        filters: { tenureYearsMin: 10 },
        slotSources: { tenureYearsMin: "stated" },
        unsupported: [],
      }) +
      "\n```";
    const { run, model } = ask(G4, [fenced, NOT_JSON]);
    const answer = await run;
    expect(answer.plan.area.resolved?.name).toBe("Lakeway city");
    expect(answer.outcome).not.toBe("needs_clarification");
    expect(answer.trace.modelCalls).toBe(2);
    expect(model.doGenerateCalls.length).toBe(2);
  });

  it("prose around the JSON still parses", async () => {
    const wrapped =
      "Sure! Here is the plan:\n" +
      planText({
        intent: "find_permits",
        area: { kind: "place", query: "Manor", radiusMi: 5 },
        ...goodTail,
      }) +
      "\nLet me know if you need more.";
    const { run } = ask(G3, [wrapped, NOT_JSON]);
    expect((await run).plan.area.resolved?.name).toBe("Manor city");
  });

  it("a ZIP named in the question is used when the model blanked the area", async () => {
    const { run } = ask("How many roofs older than 20 years in ZIP 78701?", [
      planText({
        intent: "find_properties",
        area: { kind: "place", query: "", radiusMi: 5 },
        filters: { roofAgeMinYears: 20 },
        slotSources: { roofAgeMinYears: "stated" },
      }),
      NOT_JSON,
    ]);
    const answer = await run;
    expect(answer.plan.area.kind).toBe("zip");
    expect(answer.plan.area.resolved).toMatchObject({ name: "ZCTA5 78701", match: "zip" });
  });

  it("'downtown Austin' is still not searched: it asks which place, offering Austin", async () => {
    const q = "Which properties within 3 miles of downtown Austin have roofs older than 20 years?";
    const { run, index } = ask(q, [
      planText({
        intent: "find_properties",
        area: { kind: "place", query: "downtown Austin", radiusMi: 3 },
        filters: { roofAgeMinYears: 20 },
        slotSources: { roofAgeMinYears: "stated", radiusMi: "stated" },
      }),
    ]);
    const answer = await run;
    expect(answer.outcome).toBe("needs_clarification");
    expect(answer.candidates?.[0]?.name).toBe("Austin city");
    expect(answer.candidates?.[0]?.score).toBeLessThan(0.8);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("a place that is truly unknown is refused (not_found) and still offers the closest known places", async () => {
    const { run, index } = ask("roofs near Zzyzxville", [
      planText({
        intent: "find_properties",
        area: { kind: "place", query: "Zzyzxville", radiusMi: 5 },
        filters: {},
        slotSources: {},
      }),
    ]);
    const answer = await run;
    expect(answer.outcome).toBe("not_found");
    expect((answer.candidates ?? []).length).toBeGreaterThan(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("a ZIP outside Travis stays out_of_scope even though the scan found it", async () => {
    const { run } = ask("How many properties have roofs older than 40 years in ZIP 99999?", [
      planText({
        intent: "find_properties",
        area: { kind: "zip", query: "99999", radiusMi: 5 },
        filters: { roofAgeMinYears: 40 },
        slotSources: { roofAgeMinYears: "stated" },
      }),
    ]);
    expect((await run).outcome).toBe("out_of_scope");
  });
});

describe("GAP-4: a ZIP is a radius around the ZCTA centre, and says so", () => {
  const zipQuestion = "How many properties have roofs older than 20 years in ZIP 78701?";
  const zipPlan = (radiusSource?: "stated") =>
    planText({
      intent: "find_properties",
      area: { kind: "zip", query: "78701", radiusMi: 5 },
      filters: { roofAgeMinYears: 20 },
      slotSources: {
        roofAgeMinYears: "stated",
        ...(radiusSource ? { radiusMi: radiusSource } : {}),
      },
    });

  it("defaults an unstated ZIP radius to 2 mi (marked default) and flags postal_code as not published", async () => {
    const { run, index } = ask(zipQuestion, [zipPlan(), NOT_JSON]);
    const answer = await run;
    expect(answer.plan.area.radiusMi).toBe(2);
    expect(answer.plan.slotSources.radiusMi).toBe("default");
    expect(index.searchPropertiesCalls[0]?.radiusMi).toBe(2);
    expect(answer.missing).toContainEqual({ field: "postal_code", reason: "not_in_export" });
    expect(answer.claims[0]?.text).toContain("not the ZIP's boundary");
  });

  it("keeps a radius the rep stated", async () => {
    const { run } = ask(`${zipQuestion} Use 4 miles.`, [zipPlan("stated"), NOT_JSON]);
    expect((await run).plan.area.radiusMi).toBe(5);
  });
});
