// B-09 X2 regression (live Run 3.1): "within 5 miles of Houston" came back from the plan model as
// area "Austin" with Houston only in unsupported, and the agent answered for Austin. A place the
// question names that the gazetteer cannot place in Travis County is refused, never replaced.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import { runAsk } from "../../src/agent/composeAnswer.js";
import { scanQuestionForNamedPlace } from "../../src/agent/placeScan.js";
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

async function ask(question: string, plan: Record<string, unknown>) {
  const index = new FakeLeadIndex([property()], [permit()]);
  const answer = await runAsk({
    model: scriptedModel([planText(plan), "not json"]),
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver: createPlaceResolver(),
    question,
    traceId: "t",
    obs,
  });
  return { answer, index };
}

const area = (query: string, radiusMi = 5) => ({ kind: "place", query, radiusMi });
const stated = { roofAgeMinYears: "stated", radiusMi: "stated" };

describe("a place named in the question is never replaced by another place", () => {
  const X2 = "Which properties within 5 miles of Houston have roofs older than 20 years?";

  it("the exact live plan (area Austin, Houston unsupported) is refused", async () => {
    const { answer, index } = await ask(X2, {
      intent: "find_properties",
      area: area("Austin"),
      filters: { roofAgeMinYears: 20 },
      slotSources: stated,
      unsupported: [{ constraint: "Houston", reason: "not_in_export" }],
    });
    expect(answer.outcome).toBe("out_of_scope");
    expect(answer.claims).toHaveLength(0);
    expect(answer.rows ?? []).toHaveLength(0);
    expect(answer.citations).toHaveLength(0);
    expect(answer.counts.matched).toBe(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("a blank area with Houston in the question is refused as out of scope", async () => {
    const { answer, index } = await ask(X2, {
      intent: "find_properties",
      area: area(""),
      filters: { roofAgeMinYears: 20 },
      slotSources: stated,
    });
    expect(answer.outcome).toBe("out_of_scope");
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it.each([
    ["Dallas", "Which properties within 5 miles of Dallas have roofs older than 20 years?"],
    [
      "San Antonio",
      "Which properties within 5 miles of San Antonio have roofs older than 20 years?",
    ],
    ["Houston", "which properties within 5 miles of houston have roofs older than 20 years?"],
  ])("%s: a plan that substituted Austin is refused", async (_name, question) => {
    const { answer, index } = await ask(question, {
      intent: "find_properties",
      area: area("Austin"),
      filters: { roofAgeMinYears: 20 },
      slotSources: stated,
    });
    expect(answer.outcome).toBe("out_of_scope");
    expect(answer.rows ?? []).toHaveLength(0);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("the plan naming Houston itself is still refused (no regression)", async () => {
    const { answer } = await ask(X2, {
      intent: "find_properties",
      area: area("Houston"),
      filters: { roofAgeMinYears: 20 },
      slotSources: stated,
    });
    expect(["out_of_scope", "not_found"]).toContain(answer.outcome);
    expect(answer.rows ?? []).toHaveLength(0);
  });

  it.each(["Austin", "Pflugerville", "Manor", "Lakeway"])(
    "%s still resolves and is searched",
    async (place) => {
      const { answer, index } = await ask(
        `Which properties within 5 miles of ${place} have roofs older than 20 years?`,
        {
          intent: "find_properties",
          area: area(place),
          filters: { roofAgeMinYears: 20 },
          slotSources: stated,
        },
      );
      expect(answer.outcome).not.toBe("out_of_scope");
      expect(answer.outcome).not.toBe("not_found");
      expect(index.searchPropertiesCalls.length).toBeGreaterThan(0);
    },
  );

  it("a gazetteer place in the question replaces a plan that named a different one", async () => {
    const { answer } = await ask(
      "Which properties within 5 miles of Manor have roofs older than 20 years?",
      {
        intent: "find_properties",
        area: area("Austin"),
        filters: { roofAgeMinYears: 20 },
        slotSources: stated,
      },
    );
    expect(answer.plan.area.query).toBe("Manor");
  });

  it("a question with no place keeps the plan's area", async () => {
    const { answer } = await ask("Which roofs are older than 20 years?", {
      intent: "find_properties",
      area: area("Austin"),
      filters: { roofAgeMinYears: 20 },
      slotSources: stated,
    });
    expect(answer.plan.area.query).toBe("Austin");
    expect(answer.outcome).not.toBe("out_of_scope");
  });
});

describe("scanQuestionForNamedPlace", () => {
  it("reads the place after a distance or proximity cue", () => {
    expect(scanQuestionForNamedPlace("roofs within 5 miles of Houston")).toBe("Houston");
    expect(scanQuestionForNamedPlace("roofs near dallas older than 20 years")).toBe("Dallas");
    expect(scanQuestionForNamedPlace("homes near San Antonio with old roofs")).toBe("San Antonio");
  });

  it("names nothing for owner phrasing, county, or no place", () => {
    expect(scanQuestionForNamedPlace("owners who live in Dallas near Manor")).toBe("Manor");
    expect(scanQuestionForNamedPlace("homes whose owners live in Dallas")).toBeUndefined();
    expect(scanQuestionForNamedPlace("roofs in Travis County older than 20 years")).toBeUndefined();
    expect(scanQuestionForNamedPlace("Which roofs are older than 20 years?")).toBeUndefined();
  });
});
