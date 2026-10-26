// F-2: the Ask agent keeps the rep's permit condition. "Roofs older than 25 years within 2 miles
// of Austin city center with a stalled roofing permit" must search properties WITH a stalled permit
// (not just old roofs), whether the model carried statusClass in the plan or dropped it. The model
// is a scripted stub; the paid golden suite is not involved.
import { describe, expect, it } from "vitest";
import { yearsToDays } from "@crm/domain";
import { createObservability } from "@crm/observability";
import {
  formatCount,
  permitConditionText,
  runAsk,
  scanQuestionForPermitStatus,
} from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  PERMIT_CID_P,
  PROPERTY_CID_A,
  PROPERTY_CID_B,
  emptyLeadRepo,
  permit,
  planText,
  property,
  scriptedModel,
  spyResolver,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const QUESTION =
  "roofs older than 25 years within 2 miles of Austin city center with a stalled roofing permit";
const PLAN = {
  intent: "find_properties",
  area: { kind: "place", query: "Austin", radiusMi: 2 },
  slotSources: { roofAgeMinYears: "stated", radiusMi: "stated" },
};

// A is old with a stalled permit, B is old with a closed one, C is old with none.
const PROPERTY_CID_C = "bafkreicccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
function fixture() {
  return new FakeLeadIndex(
    [
      property({ roofAgeYears: 40, latitude: 30.2672, longitude: -97.7431 }),
      property({
        propertyCid: PROPERTY_CID_B,
        requestIdentifier: "R-0002",
        roofAgeYears: 33,
        latitude: 30.268,
        longitude: -97.744,
      }),
      property({
        propertyCid: PROPERTY_CID_C,
        requestIdentifier: "R-0003",
        roofAgeYears: 29,
        latitude: 30.269,
        longitude: -97.745,
      }),
    ],
    [
      permit({ propertyCid: PROPERTY_CID_A, statusClass: "stalled", openDays: 4000 }),
      permit({
        propertyCid: PROPERTY_CID_B,
        permitCid: "bafkreiqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
        permitNumber: "2018-000001",
        statusClass: "closed",
        openDays: 0,
      }),
    ],
  );
}

function ask(texts: readonly string[], index: FakeLeadIndex, question = QUESTION) {
  return runAsk({
    model: scriptedModel(texts),
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: spyResolver(createPlaceResolver()),
    question,
    traceId: "trace-1",
    obs,
  });
}

describe("F-2: the permit condition reaches the property search", () => {
  it("a plan that carries statusClass searches only properties with a stalled permit", async () => {
    const index = fixture();
    const answer = await ask(
      [
        planText({
          ...PLAN,
          filters: { roofAgeMinYears: 25, statusClass: ["stalled"] },
          slotSources: { ...PLAN.slotSources, statusClass: "stated" },
        }),
        "not json, so the template answers",
      ],
      index,
    );
    expect(index.searchPropertiesCalls.at(-1)).toMatchObject({
      roofAgeMinYears: 25,
      permitStatusClass: ["stalled"],
    });
    expect(answer.counts.matched).toBe(1);
    expect(answer.plan.filters.statusClass).toEqual(["stalled"]);
    expect(answer.claims[0]?.text).toContain("1 matching property");
    expect(answer.claims[0]?.text).toContain(
      "roof at least 25 years old (roof age estimated from the year built) and a stalled permit",
    );
  });

  it("a plan that dropped the permit is repaired from the question text", async () => {
    const index = fixture();
    const answer = await ask(
      [planText({ ...PLAN, filters: { roofAgeMinYears: 25 } }), "not json"],
      index,
    );
    expect(index.searchPropertiesCalls.at(-1)).toMatchObject({ permitStatusClass: ["stalled"] });
    expect(answer.counts.matched).toBe(1);
    expect(answer.plan.slotSources.statusClass).toBe("stated");
  });

  it("without a permit condition in the question nothing is added", async () => {
    const index = fixture();
    const answer = await ask(
      [planText({ ...PLAN, filters: { roofAgeMinYears: 25 } }), "not json"],
      index,
      "roofs older than 25 years within 2 miles of Austin city center",
    );
    expect(index.searchPropertiesCalls.at(-1)?.permitStatusClass).toBeUndefined();
    expect(answer.counts.matched).toBe(3);
  });

  it("an open permit includes stalled ones (one definition everywhere)", async () => {
    const index = fixture();
    await ask(
      [planText({ ...PLAN, filters: { roofAgeMinYears: 25, statusClass: ["open"] } }), "not json"],
      index,
    );
    expect(index.searchPropertiesCalls.at(-1)?.permitStatusClass?.slice().sort()).toEqual([
      "open",
      "stalled",
    ]);
  });

  it("open years travel as days on the same permit", async () => {
    const index = fixture();
    const answer = await ask(
      [
        planText({
          ...PLAN,
          filters: { roofAgeMinYears: 25, statusClass: ["stalled"], openYearsMin: 20 },
        }),
        "not json",
      ],
      index,
    );
    // 4000 days is about 11 years: below 20 years, so nothing matches.
    expect(index.searchPropertiesCalls.at(-1)?.permitOpenDaysMin).toBe(yearsToDays(20));
    expect(answer.counts.matched).toBe(0);
  });

  it("the compose step is told the permit condition", async () => {
    const index = fixture();
    const model = scriptedModel([
      planText({ ...PLAN, filters: { roofAgeMinYears: 25, statusClass: ["stalled"] } }),
      JSON.stringify({
        claims: [{ text: "R-0001 has a stalled permit open 4000 days.", citationIds: [1] }],
      }),
    ]);
    await runAsk({
      model,
      leadIndex: index,
      leadRepo: emptyLeadRepo(),
      placeResolver: spyResolver(createPlaceResolver()),
      question: QUESTION,
      traceId: "t",
      obs,
    });
    const composePrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(composePrompt).toContain("permitCondition");
    expect(composePrompt).toContain("a stalled permit");
  });
});

describe("F-2: number formatting in the answer", () => {
  it("groups thousands so a count never runs into the text around it", async () => {
    expect(formatCount(123646)).toBe("123,646");
    expect(formatCount(14394)).toBe("14,394");
    expect(formatCount(25)).toBe("25");
  });

  it("the template states a large count with separators and keeps the 25 apart", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      property({
        propertyCid: `bafkrei${String(i).padStart(2, "0")}${"a".repeat(55)}`,
        requestIdentifier: `R-${i}`,
      }),
    );
    const index = new FakeLeadIndex(many, [], 123_646);
    const answer = await ask(
      [planText({ ...PLAN, filters: { roofAgeMinYears: 25 } }), "not json"],
      index,
      "roofs older than 25 years within 2 miles of Austin city center",
    );
    const text = answer.claims[0]?.text ?? "";
    expect(text).toMatch(
      /roof at least 25 years old \(roof age estimated from the year built\); showing the top 25\./,
    );
    expect(text).not.toMatch(/\d\.\d/);
  });
});

describe("F-2: reading the permit condition from the question", () => {
  it.each([
    ["with a stalled roofing permit", ["stalled"]],
    ["that have an open permit", ["open"]],
    ["with an Open building permit", ["open"]],
  ])("%s", (q, expected) => {
    expect(scanQuestionForPermitStatus(q)).toEqual(expected);
  });

  it.each([
    "with no open permits",
    "without a stalled permit",
    "homes that never had an open permit",
    "roofs older than 25 years",
  ])("%s -> nothing", (q) => {
    expect(scanQuestionForPermitStatus(q)).toBeUndefined();
  });

  it("describes the condition in words", () => {
    const plan = (filters: Record<string, unknown>) =>
      ({ filters }) as unknown as Parameters<typeof permitConditionText>[0];
    expect(permitConditionText(plan({}))).toBe("");
    expect(permitConditionText(plan({ statusClass: ["stalled"] }))).toBe("a stalled permit");
    expect(permitConditionText(plan({ statusClass: ["open"], openYearsMin: 5 }))).toBe(
      "an open or stalled permit open 5+ years",
    );
  });
});

void PERMIT_CID_P;
void PROPERTY_CID_A;
