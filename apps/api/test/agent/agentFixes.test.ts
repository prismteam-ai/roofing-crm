// B-09 Run 3.1 golden re-run defects 2 to 4 (docs/evidence/B-09.md): the roof-age basis is always
// disclosed, a permit question with no permit number is a list not a lookup, and a place named in a
// thread follow-up never inherits the thread's previous place. The model is scripted throughout.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import type { QueryPlan } from "@crm/shared";
import {
  applyInheritance,
  PLAN_SYSTEM_PROMPT,
  repairLookupPermitWithoutNumber,
  repairTcadIdLookup,
  repairPlanFromQuestion,
  roofBasisPhrase,
  runAsk,
  stalledMixPhrase,
  type RunAskInput,
} from "../../src/agent/composeAnswer.js";
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
const NOT_JSON = "not json";
const compose = (claims: unknown[]) => JSON.stringify({ claims, citations: [] });

function ask(
  question: string,
  texts: readonly string[],
  index: FakeLeadIndex,
  extra: Partial<RunAskInput> = {},
) {
  const model = scriptedModel(texts);
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
  return { run, model };
}

const ROOF_Q = "Which properties within 5 miles of Pflugerville have roofs older than 15 years?";
const roofPlan = planText({
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: { roofAgeMinYears: 15 },
  slotSources: { roofAgeMinYears: "stated", radiusMi: "stated" },
});

describe("defect 2: roof-age basis is disclosed in claim text", () => {
  it("roofBasisPhrase names the year built, a closed permit, or both", () => {
    const built = { roofAgeYears: 30, roofAgeBasis: "built_year" as const };
    const byPermit = { roofAgeYears: 30, roofAgeBasis: "permit" as const };
    expect(roofBasisPhrase([built])).toBe("roof age estimated from the year built");
    expect(roofBasisPhrase([byPermit])).toBe("roof age from a closed roofing permit");
    expect(roofBasisPhrase([built, byPermit])).toMatch(/closed roofing permit.*year built/);
    expect(roofBasisPhrase([{ roofAgeYears: null, roofAgeBasis: "built_year" }])).toBe("");
    expect(roofBasisPhrase([])).toBe("");
  });

  it("counts-only template path: the claim says the age is estimated from the year built", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims[0]?.text).toMatch(
      /roof at least 15 years old \(roof age estimated from the year built\)/,
    );
  });

  it("template path with a permit-based age says it comes from a closed roofing permit", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "permit" })]);
    const { run } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    const answer = await run;
    expect(answer.claims[0]?.text).toMatch(/closed roofing permit/);
    expect(answer.claims[0]?.text).not.toMatch(/year built/);
  });

  it("a model claim without the basis gets it appended; numbers still verify strictly", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(
      ROOF_Q,
      [roofPlan, compose([{ text: "R-0001 has a 32 year old roof.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.claims[0]?.text).toMatch(
      /^R-0001 has a 32 year old roof\. Roof age estimated from the year built\.$/,
    );
  });

  it("a model claim that already discloses is left alone", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const text = "R-0001's roof is about 32 years old, estimated from the year built.";
    const { run } = ask(ROOF_Q, [roofPlan, compose([{ text, citationIds: [1] }])], index);
    const answer = await run;
    expect(answer.claims[0]?.text).toBe(text);
  });

  it("a claim with a wrong roof age is still dropped (verification stays strict)", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 32, roofAgeBasis: "built_year" })]);
    const { run } = ask(
      ROOF_Q,
      [roofPlan, compose([{ text: "R-0001 has a 41 year old roof.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.claims.map((c) => c.text).join(" ")).not.toMatch(/41/);
    expect(answer.claims[0]?.text).toMatch(/year built/);
  });

  it("a permit question gets no roof-basis sentence", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run } = ask(
      "Show me open roofing permits within 5 miles of Manor",
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Manor", radiusMi: 5 },
          filters: { statusClass: ["open"] },
          slotSources: { statusClass: "stated", radiusMi: "stated" },
        }),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.claims[0]?.text).not.toMatch(/year built/);
  });

  it("the compose prompt tells the model to disclose the basis", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(ROOF_Q, [roofPlan, NOT_JSON], index);
    await run;
    const system = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(system).toMatch(/estimated from the year/);
  });
});

describe("defect 3: a permit question with no permit number is find_permits", () => {
  const Q =
    "Who is the listed contractor on the oldest stalled roofing permit within 2 miles of Austin?";
  const lookup: QueryPlan = {
    intent: "lookup_permit",
    area: { kind: "place", query: "Austin", radiusMi: 5 },
    filters: {},
    slotSources: {},
    unsupported: [],
  };

  it("repairs lookup_permit to find_permits with place, radius and status carried", () => {
    const out = repairLookupPermitWithoutNumber(lookup, Q);
    expect(out).toMatchObject({
      intent: "find_permits",
      area: { kind: "place", query: "Austin", radiusMi: 2 },
      filters: { statusClass: ["stalled"] },
      slotSources: { statusClass: "stated", area: "stated", radiusMi: "stated" },
    });
    expect(out?.filters.permitNumber).toBeUndefined();
  });

  it("takes the place from the question when the plan left area.query blank or the sentence", () => {
    const blank = { ...lookup, area: { ...lookup.area, query: "" } };
    expect(repairLookupPermitWithoutNumber(blank, Q)?.area.query).toBe("Austin");
    const sentence = { ...lookup, area: { ...lookup.area, query: Q } };
    expect(repairLookupPermitWithoutNumber(sentence, Q)?.area.query).toBe("Austin");
  });

  it("goes through repairPlanFromQuestion and records the repair", () => {
    const out = repairPlanFromQuestion(lookup, Q);
    expect(out.plan.intent).toBe("find_permits");
    expect(out.repairs.join(" ")).toMatch(/lookup_permit -> find_permits/);
  });

  it("leaves a real permit lookup alone (number in the plan, the question, or area.query)", () => {
    const withNumber = { ...lookup, filters: { permitNumber: "1982-009789 BP" } };
    expect(repairLookupPermitWithoutNumber(withNumber, Q)).toBeUndefined();
    const asked = "What is the status of permit 1982-009789 BP near Austin?";
    expect(repairLookupPermitWithoutNumber(lookup, asked)).toBeUndefined();
    const inArea = { ...lookup, area: { ...lookup.area, query: "1982-009789 BP" } };
    expect(repairLookupPermitWithoutNumber(inArea, Q)).toBeUndefined();
    expect(
      repairLookupPermitWithoutNumber({ ...lookup, intent: "find_permits" }, Q),
    ).toBeUndefined();
  });

  it("without a place in the question it stays a lookup (and so asks, not guesses)", () => {
    expect(
      repairLookupPermitWithoutNumber(
        { ...lookup, area: { ...lookup.area, query: "" } },
        "the oldest stalled permit",
      ),
    ).toBeUndefined();
  });

  it("runAsk: the lookup plan the model gave is searched as a permit list, not a not_found lookup", async () => {
    const index = new FakeLeadIndex([property()], [permit({ statusClass: "stalled" })]);
    const { run } = ask(
      Q,
      [
        planText({
          intent: "lookup_permit",
          area: { kind: "place", query: "Austin", radiusMi: 5 },
        }),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.plan.intent).toBe("find_permits");
    expect(answer.plan.filters.statusClass).toEqual(["stalled"]);
    expect(answer.outcome).not.toBe("not_found");
    expect(index.searchPermitsCalls[0]).toMatchObject({ statusClass: ["stalled"] });
    expect(answer.trace.planRepairs?.join(" ")).toMatch(/find_permits/);
  });

  it("the plan prompt carries the oldest-stalled example and the lookup_permit rule", async () => {
    const { PLAN_SYSTEM_PROMPT } = await import("../../src/agent/composeAnswer.js");
    expect(PLAN_SYSTEM_PROMPT).toMatch(/oldest stalled roofing permit within 2 miles of Austin/);
    expect(PLAN_SYSTEM_PROMPT).toMatch(/lookup_permit ONLY when the rep typed a permit number/);
  });
});

describe("defect 4: a place named in a follow-up never inherits the thread's place", () => {
  const previousPlan: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Austin", radiusMi: 5 },
    filters: { roofAgeMinYears: 20 },
    slotSources: { roofAgeMinYears: "stated" },
    unsupported: [],
  };
  const Q = "Which properties within 5 miles of Houston have roofs older than 20 years?";

  it("applyInheritance: the plan's own place, marked inherited by mistake, is kept as stated", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "Houston", radiusMi: 5 },
      slotSources: { area: "inherited", roofAgeMinYears: "stated" },
    };
    const out = applyInheritance(plan, previousPlan, Q);
    expect(out.area.query).toBe("Houston");
    expect(out.slotSources.area).toBe("stated");
  });

  it("applyInheritance: a blank area with an inherited mark still takes Houston from the question", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    expect(applyInheritance(plan, previousPlan, Q).area.query).toBe("Houston");
  });

  it("applyInheritance: a real follow-up with no place still inherits", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    const out = applyInheritance(plan, previousPlan, "Only the ones with a stalled permit");
    expect(out.area.query).toBe("Austin");
    expect(out.slotSources.area).toBe("inherited");
  });

  it("applyInheritance: restating the same place is still the inherited place", () => {
    const plan: QueryPlan = {
      ...previousPlan,
      area: { kind: "place", query: "Austin", radiusMi: 5 },
      slotSources: { area: "inherited" },
    };
    expect(applyInheritance(plan, previousPlan, "Same but near Austin").slotSources.area).toBe(
      "inherited",
    );
  });

  it.each([
    ["the model copies Houston but marks it inherited", "Houston"],
    ["the model leaves the area blank and marks it inherited", ""],
    ["the model copies the previous place and marks it inherited", "Austin"],
  ])("runAsk in a thread: %s -> refused, no property search", async (_label, query) => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      Q,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query, radiusMi: 5 },
          filters: { roofAgeMinYears: 20 },
          slotSources: { area: "inherited", roofAgeMinYears: "stated" },
        }),
      ],
      index,
      { previousPlan },
    );
    const answer = await run;
    expect(["out_of_scope", "not_found", "needs_clarification"]).toContain(answer.outcome);
    expect(answer.plan.area.query).toBe("Houston");
    expect(answer.claims).toHaveLength(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("the follow-up plan prompt says a question naming a place is not an area follow-up", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(Q, [roofPlan], index, { previousPlan });
    await run;
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toMatch(/names a place of its own/);
  });
});

describe("Run 3.1: stalled permits are open and not progressing, and the answer says so", () => {
  const Q = "Which open roofing permits have been open for many years near Pflugerville?";
  const openPlan = planText({
    intent: "find_permits",
    area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
    filters: { statusClass: ["open"], openYearsMin: 5 },
    slotSources: { statusClass: "stated", openYearsMin: "stated", radiusMi: "stated" },
  });
  const stalledIndex = () =>
    new FakeLeadIndex(
      [property()],
      [permit({ statusClass: "stalled", openDays: 8269, permitNumber: "2004-011296 BP" })],
    );

  it("stalledMixPhrase is empty, all, or some, and never carries a number", () => {
    expect(stalledMixPhrase([])).toBe("");
    expect(stalledMixPhrase([{ statusClass: "open" }])).toBe("");
    expect(stalledMixPhrase([{ statusClass: "stalled" }])).toBe(
      "all are stalled: open and not progressing",
    );
    expect(stalledMixPhrase([{ statusClass: "stalled" }, { statusClass: "open" }])).toBe(
      "some are stalled: open and not progressing",
    );
  });

  it("template path states that the found permits are stalled", async () => {
    const { run } = ask(Q, [openPlan, NOT_JSON], stalledIndex());
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims[0]?.text).toMatch(
      /matching permit \(all are stalled: open and not progressing\)/,
    );
  });

  it("a model claim that omits the status gets the sentence appended", async () => {
    const { run } = ask(
      Q,
      [
        openPlan,
        compose([{ text: "Permit 2004-011296 BP is open 8,269 days.", citationIds: [1] }]),
      ],
      stalledIndex(),
    );
    const answer = await run;
    expect(answer.claims[0]?.text).toMatch(
      /^Permit 2004-011296 BP is open 8,269 days\. Permit status: all are stalled: open and not progressing\.$/,
    );
  });

  it("a model claim that already says stalled is left alone, and a wrong number is still dropped", async () => {
    const text = "Permit 2004-011296 BP is stalled and has been open 8,269 days.";
    const ok = await ask(Q, [openPlan, compose([{ text, citationIds: [1] }])], stalledIndex()).run;
    expect(ok.claims[0]?.text).toBe(text);
    const bad = await ask(
      Q,
      [openPlan, compose([{ text: "It is stalled and open 9,999 days.", citationIds: [1] }])],
      stalledIndex(),
    ).run;
    expect(bad.claims.map((c) => c.text).join(" ")).not.toMatch(/9,999/);
  });

  it("no stalled permit, no sentence", async () => {
    const { run } = ask(Q, [openPlan, NOT_JSON], new FakeLeadIndex([property()], [permit()]));
    const answer = await run;
    expect(answer.claims[0]?.text).not.toMatch(/stalled/);
  });

  it("the compose prompt carries the permit status and tells the model to state it", async () => {
    const { run, model } = ask(Q, [openPlan, NOT_JSON], stalledIndex());
    await run;
    const prompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(prompt).toMatch(/permitStatus/);
    expect(prompt).toMatch(/open and not progressing/);
  });
});

describe("outbound messaging is refused at the scope gate (X5)", () => {
  const OUTBOUND_Q = "Email the owners of those properties about a free roof inspection";
  const nearPlan = planText({
    intent: "find_properties",
    area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
    filters: { roofAgeMinYears: 15 },
    slotSources: { roofAgeMinYears: "default", radiusMi: "default" },
  });

  it("refuses with out_of_scope, runs no search, and records why in plan.unsupported", async () => {
    const index = new FakeLeadIndex([property({ ownerName: "JANE Q SMITH" })]);
    // Only the plan call is scripted: a second (compose) model call would throw.
    const { run } = ask(OUTBOUND_Q, [nearPlan], index);
    const answer = await run;
    expect(answer.outcome).toBe("out_of_scope");
    expect(answer.plan.unsupported).toContainEqual({
      constraint: "send messages to owners",
      reason: "out_of_scope",
    });
    expect(answer.claims).toEqual([]);
    expect(answer.citations).toEqual([]);
    expect(answer.rows ?? []).toEqual([]);
    expect(answer.counts.matched).toBe(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
    expect(index.searchPermitsCalls).toHaveLength(0);
    expect(JSON.stringify(answer)).not.toMatch(/JANE/);
  });

  it("refuses even when the plan model reads the request as a place the gazetteer does not know", async () => {
    const index = new FakeLeadIndex([property()]);
    const odd = planText({
      intent: "find_properties",
      area: { kind: "place", query: "those properties", radiusMi: 5 },
      filters: {},
      slotSources: {},
    });
    const answer = await ask(OUTBOUND_Q, [odd], index).run;
    expect(answer.outcome).toBe("out_of_scope");
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("honours the model's own out_of_scope marker for a request the words do not catch", async () => {
    const index = new FakeLeadIndex([property()]);
    const flagged = planText({
      intent: "find_properties",
      area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
      filters: {},
      slotSources: {},
      unsupported: [{ constraint: "send messages to owners", reason: "out_of_scope" }],
    });
    const answer = await ask("Drop the roofers a line about those", [flagged], index).run;
    expect(answer.outcome).toBe("out_of_scope");
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("does not refuse ordinary questions that mention owners, contact or mail", async () => {
    for (const q of [
      ROOF_Q,
      "Which properties near Pflugerville have owners with a mailing address outside the area?",
      "What is the contact for the owners of 0208011301?",
      "List the owner names and send them to the model so it can draft a mailing list.",
    ]) {
      const index = new FakeLeadIndex([property({ roofAgeYears: 32 })]);
      const answer = await ask(q, [roofPlan, NOT_JSON], index).run;
      expect(answer.outcome, q).not.toBe("out_of_scope");
    }
  });

  it("the plan prompt tells the model how to mark a messaging request out of scope", () => {
    expect(PLAN_SYSTEM_PROMPT).toMatch(/never sends messages/);
    expect(PLAN_SYSTEM_PROMPT).toMatch(
      /"constraint":"send messages to owners","reason":"out_of_scope"/,
    );
  });
});

describe("a TCAD account id is a property lookup, never a radius search", () => {
  const Q = "Tell me about TCAD 181990";
  const radius: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "181990", radiusMi: 5 },
    filters: {},
    slotSources: {},
    unsupported: [],
  };

  it("repairs a radius plan around the id into lookup_property with the id as area.query", () => {
    const out = repairTcadIdLookup(radius, Q);
    expect(out).toMatchObject({ intent: "lookup_property", area: { query: "181990" } });
    expect(repairPlanFromQuestion(radius, Q).repairs.join(" ")).toMatch(/lookup_property/);
  });

  it("takes the id from phrasings such as 'TCAD account #181990' and leaves other questions alone", () => {
    expect(repairTcadIdLookup(radius, "what is TCAD account #181990?")?.area.query).toBe("181990");
    expect(repairTcadIdLookup(radius, "roofs within 5 miles of Austin")).toBeUndefined();
    expect(repairTcadIdLookup(radius, "TCAD 12")).toBeUndefined();
    const already = { ...radius, intent: "lookup_property" as const };
    expect(repairTcadIdLookup(already, Q)).toBeUndefined();
  });

  it("runAsk: the plan the model gave as a radius search is answered as a lookup of that property", async () => {
    const index = new FakeLeadIndex(
      [property({ requestIdentifier: "181990" })],
      [permit({ statusClass: "stalled" })],
    );
    const { run } = ask(
      Q,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "181990", radiusMi: 5 },
        }),
        NOT_JSON,
      ],
      index,
    );
    const answer = await run;
    expect(answer.plan.intent).toBe("lookup_property");
    expect(answer.outcome).toBe("answered");
    expect(index.searchPropertiesCalls).toHaveLength(0);
    expect(answer.trace.planRepairs?.join(" ")).toMatch(/lookup_property/);
  });

  it("the plan prompt carries the TCAD example", () => {
    expect(PLAN_SYSTEM_PROMPT).toMatch(/Tell me about TCAD 181990/);
  });
});

describe("follow-up inherits the previous plan's filters and adds the new one", () => {
  const previousPlan: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 2 },
    filters: { roofAgeMinYears: 25 },
    slotSources: { roofAgeMinYears: "stated", radiusMi: "stated", area: "stated" },
    unsupported: [],
  };
  const FOLLOW = "Only the ones with an open permit";
  const index = () => new FakeLeadIndex([property()], [permit()]);

  it("applyInheritance: previous filters are the base, the follow-up's statusClass is added", () => {
    const plan: QueryPlan = {
      intent: "find_properties",
      area: { kind: "place", query: "", radiusMi: 5 },
      filters: { statusClass: ["open"] },
      slotSources: { area: "inherited", statusClass: "stated", radiusMi: "default" },
      unsupported: [],
    };
    const out = applyInheritance(plan, previousPlan, FOLLOW);
    expect(out.filters).toEqual({ roofAgeMinYears: 25, statusClass: ["open"] });
    expect(out.area).toMatchObject({ query: "Lakeway", radiusMi: 2 });
    expect(out.slotSources.roofAgeMinYears).toBe("inherited");
    expect(out.slotSources.statusClass).toBe("stated");
  });

  it("runAsk: the exact scenario searches roof 25+, 2 mi, Lakeway and the live-permit condition", async () => {
    const idx = index();
    const { run } = ask(
      FOLLOW,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 5 },
          filters: { statusClass: ["open"] },
          slotSources: { area: "inherited", statusClass: "inherited", radiusMi: "default" },
        }),
        NOT_JSON,
      ],
      idx,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.filters).toMatchObject({ roofAgeMinYears: 25, statusClass: ["open"] });
    expect(answer.plan.area).toMatchObject({ query: "Lakeway", radiusMi: 2 });
    const call = idx.searchPropertiesCalls.at(-1);
    expect(call?.roofAgeMinYears).toBe(25);
    expect(call?.permitStatusClass).toEqual(expect.arrayContaining(["open", "stalled"]));
    expect(call?.radiusMi).toBe(2);
  });

  it("a follow-up that states a new radius changes only the radius", async () => {
    const idx = index();
    const { run } = ask(
      "Only the ones with an open permit within 4 miles",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 4 },
          filters: { statusClass: ["open"] },
          slotSources: { area: "inherited", statusClass: "stated", radiusMi: "stated" },
        }),
        NOT_JSON,
      ],
      idx,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.area.radiusMi).toBe(4);
    expect(answer.plan.filters.roofAgeMinYears).toBe(25);
    expect(answer.plan.filters.statusClass).toEqual(["open"]);
  });

  it("a follow-up that states a new roof age overrides only the roof age", async () => {
    const idx = index();
    const { run } = ask(
      "Same area but roofs 30 years or older with an open permit",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 5 },
          filters: { roofAgeMinYears: 30, statusClass: ["open"] },
          slotSources: {
            area: "inherited",
            roofAgeMinYears: "stated",
            statusClass: "stated",
            radiusMi: "default",
          },
        }),
        NOT_JSON,
      ],
      idx,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.filters.roofAgeMinYears).toBe(30);
    expect(answer.plan.filters.statusClass).toEqual(["open"]);
    expect(answer.plan.area.radiusMi).toBe(2);
  });

  it("a plan that lost the permit condition gets it back from the question", async () => {
    const idx = index();
    const { run } = ask(
      FOLLOW,
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 5 },
          slotSources: { area: "inherited" },
        }),
        NOT_JSON,
      ],
      idx,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.filters.statusClass).toEqual(["open"]);
    expect(answer.plan.filters.roofAgeMinYears).toBe(25);
  });

  it("a question with its own place does NOT inherit the previous filters", async () => {
    const idx = index();
    const { run } = ask(
      "Which properties within 3 miles of Pflugerville have an open permit?",
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 3 },
          filters: { statusClass: ["open"] },
          slotSources: { statusClass: "stated", radiusMi: "stated", area: "stated" },
        }),
        NOT_JSON,
      ],
      idx,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.area).toMatchObject({ query: "Pflugerville", radiusMi: 3 });
    expect(answer.plan.filters.roofAgeMinYears).toBeUndefined();
    expect(idx.searchPropertiesCalls.at(-1)?.roofAgeMinYears).toBeUndefined();
  });

  it("no previous plan: nothing is inherited", () => {
    const plan: QueryPlan = {
      intent: "find_properties",
      area: { kind: "place", query: "Austin", radiusMi: 5 },
      filters: { statusClass: ["open"] },
      slotSources: { statusClass: "stated" },
      unsupported: [],
    };
    expect(applyInheritance(plan, undefined, "x").filters).toEqual({ statusClass: ["open"] });
  });
});
