// B-09 GAP-3: a question that filters on a field the search cannot apply (roof age confidence,
// residential/commercial kind) must never be answered as if it had. The server drops the filter,
// records it as unsupported with reason not_in_export, and labels the matches as not narrowed by it.
// Owner location was in this list for Run 2; Run 3.1 publishes it, so the search now applies it.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import type { QueryPlan } from "@crm/shared";
import {
  PLAN_SYSTEM_PROMPT,
  dropUnpublishedFilters,
  runAsk,
  type RunAskInput,
} from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  emptyLeadRepo,
  planText,
  property,
  scriptedModel,
} from "../support/agentFixtures.js";

const obs = createObservability("crm-api-test");
const G4 =
  "Which homes near Lakeway haven't changed owners in 10+ years and have owners outside the area?";
const NOT_JSON = "not json";

function ask(texts: readonly string[], index: FakeLeadIndex, extra: Partial<RunAskInput> = {}) {
  const model = scriptedModel(texts);
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question: G4,
    traceId: "t",
    obs,
    ...extra,
  });
  return { run, model };
}

const plan = (filters: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  planText({
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters,
    slotSources: Object.fromEntries(Object.keys(filters).map((k) => [k, "stated"])),
    ...extra,
  });

describe("dropUnpublishedFilters", () => {
  const base: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters: { tenureYearsMin: 10, ownerAreaClass: ["out_of_area"] },
    slotSources: { tenureYearsMin: "stated", ownerAreaClass: "stated" },
    unsupported: [],
  };

  it("keeps ownerAreaClass and its slot source (Run 3.1 publishes it) and adds no unsupported entry", () => {
    const out = dropUnpublishedFilters(base);
    expect(out).toEqual(base);
    expect(out.unsupported).toHaveLength(0);
  });

  it("leaves a plan without dropped filters alone", () => {
    const clean = {
      ...base,
      filters: { tenureYearsMin: 10 },
      slotSources: { tenureYearsMin: "stated" as const },
    };
    expect(dropUnpublishedFilters(clean)).toEqual(clean);
  });
});

describe("runAsk with the owner-area filter (G4, Run 3.1)", () => {
  it("passes ownerAreaClass to the search, adds no gap label, and never says owner location is unpublished", async () => {
    const index = new FakeLeadIndex([
      property({ isLongTenure: true, ownerAreaClass: "out_of_area" }),
    ]);
    const { run } = ask(
      [plan({ tenureYearsMin: 11, ownerAreaClass: ["regional", "out_of_area"] }), NOT_JSON],
      index,
    );
    const answer = await run;
    expect(index.searchPropertiesCalls.at(-1)).toMatchObject({
      ownerAreaClass: ["regional", "out_of_area"],
      tenureYearsMin: 11,
    });
    expect(answer.outcome).toBe("answered");
    expect(answer.plan.filters.ownerAreaClass).toEqual(["regional", "out_of_area"]);
    expect(answer.plan.unsupported).toHaveLength(0);
    expect(answer.missing.some((m) => /owner/i.test(m.field) && m.reason === "not_in_export")).toBe(
      false,
    );
    for (const claim of answer.claims) {
      expect(claim.text).not.toMatch(/owner location is not published|not narrowed by owner/i);
    }
  });

  it("zero matches with an owner filter is a plain empty_in_scope, not a field_not_published", async () => {
    const index = new FakeLeadIndex([]);
    const { run } = ask([plan({ ownerAreaClass: ["out_of_area"] })], index);
    const answer = await run;
    expect(answer.outcome).toBe("empty_in_scope");
    expect(index.searchPropertiesCalls.length).toBeGreaterThan(0);
  });

  it("the plan prompt maps absentee / out-of-town owners to the published area classes", () => {
    expect(PLAN_SYSTEM_PROMPT).toMatch(/in_county, regional, out_of_area/);
    expect(PLAN_SYSTEM_PROMPT).toMatch(/absentee/i);
    expect(PLAN_SYSTEM_PROMPT).toContain('["regional","out_of_area"]');
    expect(PLAN_SYSTEM_PROMPT).toContain('["in_county"]');
    expect(PLAN_SYSTEM_PROMPT).not.toMatch(/never published/i);
  });

  it("the owner's name never reaches the model (plan or compose call)", async () => {
    const index = new FakeLeadIndex([
      property({
        isLongTenure: true,
        ownerAreaClass: "out_of_area",
        ownerName: "Zebediah Quillfeather",
      }),
    ]);
    const { run, model } = ask(
      [plan({ tenureYearsMin: 11, ownerAreaClass: ["out_of_area"] }), NOT_JSON],
      index,
    );
    await run;
    expect(JSON.stringify(model.doGenerateCalls)).not.toContain("Zebediah");
  });
});

describe("filters the search does not apply (roofConfidenceMin, kind)", () => {
  const base: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Lakeway", radiusMi: 5 },
    filters: { roofAgeMinYears: 20, roofConfidenceMin: "high", kind: "commercial" },
    slotSources: { roofAgeMinYears: "stated", roofConfidenceMin: "stated", kind: "stated" },
    unsupported: [],
  };

  it("moves both to unsupported as not_in_export and removes them from filters", () => {
    const out = dropUnpublishedFilters(base);
    expect(out.filters).toEqual({ roofAgeMinYears: 20 });
    expect(out.slotSources).toEqual({ roofAgeMinYears: "stated" });
    expect(out.unsupported.map((u) => u.reason)).toEqual(["not_in_export", "not_in_export"]);
    expect(out.unsupported[0]?.constraint).toMatch(/confidence/i);
    expect(out.unsupported[1]?.constraint).toMatch(/commercial/i);
  });

  it("the answer says they were not applied, and the DATA does not echo them as filters", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 30 })]);
    const { run, model } = ask(
      [plan({ roofAgeMinYears: 20, roofConfidenceMin: "high", kind: "commercial" }), NOT_JSON],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims[0]?.text).toMatch(/not narrowed by roof age confidence or property type/i);
    const composePrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(composePrompt).not.toContain("roofConfidenceMin");
    expect(index.searchPropertiesCalls[0]).not.toHaveProperty("roofConfidenceMin");
  });
});
