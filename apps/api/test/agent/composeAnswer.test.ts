// B-09 review findings 8-11, 17 + the open thread-inheritance item (CR-B-09, alakazam): the whole
// `agent.ask` turn (`runAsk`) driven with a scripted model and an in-memory index. Each test names
// the finding it proves.
import { describe, expect, it } from "vitest";
import { createObservability } from "@crm/observability";
import { answerPins, type PlaceResolution, type QueryPlan } from "@crm/shared";
import { runAsk, type RunAskInput } from "../../src/agent/composeAnswer.js";
import { createPlaceResolver } from "../../src/services/agent/placeResolver.js";
import {
  FakeLeadIndex,
  MANIFEST_CID,
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

const PFLUGERVILLE_PLAN = {
  intent: "find_properties",
  area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
  filters: { roofAgeMinYears: 15 },
  slotSources: { roofAgeMinYears: "stated" },
};

function ask(texts: readonly string[], index: FakeLeadIndex, extra: Partial<RunAskInput> = {}) {
  const model = scriptedModel(texts);
  const placeResolver = spyResolver(createPlaceResolver());
  const run = runAsk({
    model,
    leadIndex: index,
    leadRepo: emptyLeadRepo(),
    placeResolver,
    question: "q",
    traceId: "trace-1",
    obs,
    ...extra,
  });
  return { run, model, placeResolver };
}

function compose(claims: unknown[], citations: unknown[] = []): string {
  return JSON.stringify({ claims, citations });
}

describe("finding 8: a permit citation resolves by its permitCid, not its propertyCid", () => {
  it("keeps a claim citing a permit that carries both ids (find_permits)", async () => {
    const index = new FakeLeadIndex(
      [property()],
      [
        permit(),
        permit({
          permitCid: "bafkreiqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
          permitNumber: "2020-9",
        }),
      ],
    );
    const { run } = ask(
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { statusClass: ["open"] },
        }),
        compose(
          [{ text: "Permit 2019-001234 has been open 2790 days.", citationIds: [1] }],
          [{ id: 1, propertyCid: PROPERTY_CID_A, permitCid: PERMIT_CID_P }],
        ),
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ kind: "permit", permitCid: PERMIT_CID_P });
    // finding 10: permit answers report their own matched count.
    expect(answer.counts.matched).toBe(2);
    expect(answer.counts.shown).toBe(2);
  });
});

describe("finding 9: scope gate by intent and area kind", () => {
  it("lookup_property reads area.query as the TCAD id: no place resolution, matched 1", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, placeResolver } = ask(
      [
        planText({
          intent: "lookup_property",
          area: { kind: "place", query: "R-0001", radiusMi: 5 },
        }),
        compose([{ text: "R-0001 has a 32-year-old roof.", citationIds: [1] }]),
      ],
      index,
    );
    const answer = await run;
    expect(placeResolver.calls).toEqual([]);
    expect(answer.outcome).toBe("answered");
    expect(answer.counts.matched).toBe(1);
    expect(answer.citations[0]).toMatchObject({ kind: "property", tcadId: "R-0001" });
  });

  it("lookup_property for an id not in the run is not_found, with no compose call", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(
      [
        planText({
          intent: "lookup_property",
          area: { kind: "place", query: "R-9999", radiusMi: 5 },
        }),
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("not_found");
    expect(model.doGenerateCalls.length).toBe(1);
  });

  it("lookup_permit searches county-wide by permit number, no place resolution", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run, placeResolver } = ask(
      [
        planText({
          intent: "lookup_permit",
          area: { kind: "county", query: "Travis County", radiusMi: 25 },
          filters: { permitNumber: "2019-001234" },
        }),
        compose([{ text: "Permit 2019-001234 is open.", citationIds: [1] }]),
      ],
      index,
    );
    const answer = await run;
    expect(placeResolver.calls).toEqual([]);
    expect(index.searchPermitsCalls[0]?.permitNumber).toBe("2019-001234");
    expect(answer.outcome).toBe("answered");
    expect(answer.counts.matched).toBe(1);
  });

  it("coverage answers from the run itself: no place resolution, no compose call, a run citation", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run, placeResolver, model } = ask(
      [planText({ intent: "coverage", area: { kind: "county", query: "", radiusMi: 5 } })],
      index,
    );
    const answer = await run;
    expect(placeResolver.calls).toEqual([]);
    expect(model.doGenerateCalls.length).toBe(1);
    expect(answer.outcome).toBe("answered");
    expect(answer.claims).toHaveLength(1);
    expect(answer.citations[0]).toMatchObject({ kind: "run", manifestCid: MANIFEST_CID });
  });

  it("a county-wide Travis search needs no place and counts rows without coordinates", async () => {
    const index = new FakeLeadIndex(
      [
        property(),
        property({ propertyCid: PROPERTY_CID_B, requestIdentifier: "R-0002", roofAgeYears: 20 }),
        property({
          propertyCid: "bafkreicccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          requestIdentifier: "R-0003",
          latitude: null,
          longitude: null,
          coordinateSource: "none",
        }),
      ],
      [],
    );
    const { run, placeResolver } = ask(
      [
        planText({
          intent: "find_properties",
          area: { kind: "county", query: "Travis County", radiusMi: 25 },
          filters: { roofAgeMinYears: 15 },
        }),
        compose([{ text: "2 properties match.", citationIds: [1, 2] }]),
      ],
      index,
    );
    const answer = await run;
    expect(placeResolver.calls).toEqual([]);
    expect(answer.outcome).toBe("answered");
    expect(answer.counts.matched).toBe(2);
    expect(answer.counts.excludedNoCoordinates).toBe(1);
  });

  it.each([
    ["a county other than Travis", { kind: "county", query: "Williamson County", radiusMi: 5 }],
    ["a point outside Travis", { kind: "point", query: "32.7767, -96.7970", radiusMi: 5 }],
  ])("%s is out_of_scope with exactly one model call and no search", async (_label, area) => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask([planText({ intent: "find_properties", area })], index);
    const answer = await run;
    expect(answer.outcome).toBe("out_of_scope");
    expect(model.doGenerateCalls.length).toBe(1);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });

  it("a point inside Travis is searched around that point (match user_point)", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText({
          intent: "find_properties",
          area: { kind: "point", query: "30.44, -97.60", radiusMi: 2 },
        }),
        compose([{ text: "R-0001 is within 2 mi.", citationIds: [1] }]),
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(index.searchPropertiesCalls[0]?.center).toEqual({ lat: 30.44, lng: -97.6 });
    expect(answer.plan.area.resolved).toMatchObject({ match: "user_point", lat: 30.44 });
  });

  it("an exact place match auto-accepts even with a close runner-up (ADR-06 §5: exact = 1.0)", async () => {
    const fixed: PlaceResolution = {
      status: "resolved",
      source: "travis-places@1.0.0",
      candidates: [
        { name: "Manor city", lat: 30.354228, lon: -97.558259, match: "exact", score: 1 },
        { name: "Manchaca CDP", lat: 30.135234, lon: -97.836436, match: "fuzzy", score: 0.97 },
      ],
    };
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText({ ...PFLUGERVILLE_PLAN, area: { kind: "place", query: "Manor", radiusMi: 5 } }),
        compose([{ text: "R-0001 qualifies.", citationIds: [1] }]),
      ],
      index,
      { placeResolver: spyResolver(fixed) },
    );
    expect((await run).outcome).toBe("answered");
  });

  it("an in-scope place answer records the resolved centre with gazetteer provenance", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [planText(PFLUGERVILLE_PLAN), compose([{ text: "R-0001 qualifies.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.plan.area.resolved).toMatchObject({
      name: "Pflugerville city",
      match: "exact",
      score: 1,
      source: "travis-places@1.0.0",
    });
    expect(answer.plan.area.resolved?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("finding 10: counts, missing[] and outcome come from the evidence", () => {
  it("unparseable compose output with matching rows is a template answer stating the counts", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask([planText(PFLUGERVILLE_PLAN), "Sure! Here are some roofs."], index);
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims).toHaveLength(1);
    expect(answer.claims[0]?.text).toContain("1 ");
    expect(answer.citations[0]).toMatchObject({ propertyCid: PROPERTY_CID_A });
  });

  it("compose citing only planted rows falls back to the template, never empty_in_scope", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText(PFLUGERVILLE_PLAN),
        compose(
          [{ text: "A made-up property.", citationIds: [7] }],
          [
            {
              id: 7,
              propertyCid: "bafkreiFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA",
            },
          ],
        ),
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("answered");
    expect(answer.claims).toHaveLength(1);
    expect(answer.citations.map((c) => c.propertyCid)).toEqual([PROPERTY_CID_A]);
  });

  it("no matching rows is empty_in_scope with no compose call", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 5 })]);
    const { run, model } = ask([planText(PFLUGERVILLE_PLAN)], index);
    const answer = await run;
    expect(answer.outcome).toBe("empty_in_scope");
    expect(answer.counts.matched).toBe(0);
    expect(model.doGenerateCalls.length).toBe(1);
  });

  it("counts rows the roof-age filter excluded for having no roof date", async () => {
    const index = new FakeLeadIndex([
      property(),
      property({
        propertyCid: PROPERTY_CID_B,
        requestIdentifier: "R-0002",
        roofAgeYears: null,
        roofAgeBasis: "unknown",
        roofAgeConfidence: "none",
        missingReasons: [{ field: "roofAgeYears", reason: "no_roof_date" }],
      }),
    ]);
    const { run } = ask(
      [planText(PFLUGERVILLE_PLAN), compose([{ text: "R-0001 qualifies.", citationIds: [1] }])],
      index,
    );
    const answer = await run;
    expect(answer.counts).toMatchObject({ matched: 1, excludedNoRoofDate: 1 });
    expect(answer.missing).toContainEqual(
      expect.objectContaining({ field: "roofAgeYears", reason: "no_roof_date" }),
    );
  });

  it("missing[] carries plan.unsupported and the evidence rows' own missing reasons", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run } = ask(
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { statusClass: ["open"] },
          slotSources: { statusClass: "stated" },
          unsupported: [{ constraint: "contractor phone number", reason: "not_in_export" }],
        }),
        compose([{ text: "One open permit.", citationIds: [1] }]),
      ],
      index,
    );
    const answer = await run;
    expect(answer.missing).toContainEqual({
      field: "contractor phone number",
      reason: "not_in_export",
    });
    expect(answer.missing).toContainEqual({
      field: "contractor",
      reason: "contractor_unresolved",
      count: 1,
    });
  });

  it("a question whose only constraints are unsupported is field_not_published, with no search", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          unsupported: [{ constraint: "solar panels", reason: "no_lexicon_carrier" }],
        }),
      ],
      index,
    );
    const answer = await run;
    expect(answer.outcome).toBe("field_not_published");
    expect(answer.missing).toEqual([{ field: "solar panels", reason: "no_lexicon_carrier" }]);
    expect(model.doGenerateCalls.length).toBe(1);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });
});

describe("finding 11: a claim stating a number its rows don't carry is dropped", () => {
  it("keeps the true claim, drops the wrong-roof-age claim", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText(PFLUGERVILLE_PLAN),
        compose([
          { text: "R-0001 has a 32-year-old roof.", citationIds: [1] },
          { text: "R-0001 has a 50-year-old roof.", citationIds: [1] },
        ]),
      ],
      index,
    );
    const answer = await run;
    expect(answer.claims.map((c) => c.text)).toEqual([
      "R-0001 has a 32-year-old roof. Roof age estimated from the year built.",
    ]);
  });
});

describe("finding 7: needs_clarification returns the candidate places", () => {
  it("two close fuzzy candidates -> needs_clarification with both as choices, one model call", async () => {
    const fixed: PlaceResolution = {
      status: "resolved",
      source: "travis-places@1.0.0",
      candidates: [
        { name: "Elgin city", lat: 30.35, lon: -97.39, match: "fuzzy", score: 0.93 },
        { name: "Elgen", lat: 30.1, lon: -97.1, match: "fuzzy", score: 0.92 },
      ],
    };
    const index = new FakeLeadIndex([property()]);
    const { run, model } = ask(
      [planText({ ...PFLUGERVILLE_PLAN, area: { kind: "place", query: "Elgn", radiusMi: 5 } })],
      index,
      { placeResolver: spyResolver(fixed) },
    );
    const answer = await run;
    expect(answer.outcome).toBe("needs_clarification");
    expect(answer.candidates).toEqual([
      { name: "Elgin city", score: 0.93, match: "fuzzy" },
      { name: "Elgen", score: 0.92, match: "fuzzy" },
    ]);
    expect(model.doGenerateCalls.length).toBe(1);
    expect(index.searchPropertiesCalls).toHaveLength(0);
  });
});

describe("thread follow-up: slots marked inherited take the previous plan's values (ADR-06 §6.3, G2)", () => {
  const previousPlan: QueryPlan = {
    intent: "find_properties",
    area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
    filters: { roofAgeMinYears: 15 },
    slotSources: { roofAgeMinYears: "stated" },
    unsupported: [],
  };

  it("an inherited area comes from the previous plan, not from the model's copy", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run, model } = ask(
      [
        planText({
          intent: "find_permits",
          // The model marks the area inherited but copies it wrongly; the server's copy wins.
          area: { kind: "place", query: "Pflugervill", radiusMi: 9 },
          filters: { statusClass: ["open"], openYearsMin: 5 },
          slotSources: { area: "inherited", statusClass: "stated", openYearsMin: "default" },
        }),
        compose([{ text: "One permit open 2790 days.", citationIds: [1] }]),
      ],
      index,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.area).toMatchObject({ kind: "place", query: "Pflugerville", radiusMi: 5 });
    expect(answer.plan.slotSources.area).toBe("inherited");
    expect(answer.outcome).toBe("answered");
    // The previous plan is handed to the plan call so the model can tell a follow-up apart.
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("PREVIOUS_PLAN");
  });

  it("an inherited filter takes the previous value; one the previous plan never had is dropped", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { roofAgeMinYears: 40, tenureYearsMin: 10 },
          slotSources: {
            area: "inherited",
            roofAgeMinYears: "inherited",
            tenureYearsMin: "inherited",
          },
        }),
        compose([{ text: "R-0001 qualifies.", citationIds: [1] }]),
      ],
      index,
      { previousPlan },
    );
    const answer = await run;
    expect(answer.plan.filters.roofAgeMinYears).toBe(15);
    expect(answer.plan.filters.tenureYearsMin).toBeUndefined();
    expect(answer.plan.slotSources.tenureYearsMin).toBeUndefined();
  });

  it("with no previous plan, an 'inherited' area has nothing to inherit and is not_found", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText({
          intent: "find_properties",
          area: { kind: "place", query: "", radiusMi: 5 },
          slotSources: { area: "inherited" },
        }),
      ],
      index,
    );
    expect((await run).outcome).toBe("needs_clarification");
  });
});

describe("finding 17: citationsTotal counts every citation the model produced", () => {
  it("reports planted citations in the total, not only resolved ones", async () => {
    const index = new FakeLeadIndex([property()]);
    const { run } = ask(
      [
        planText(PFLUGERVILLE_PLAN),
        compose(
          [
            { text: "R-0001 qualifies.", citationIds: [1] },
            { text: "Another one.", citationIds: [2] },
          ],
          [
            { id: 1, propertyCid: PROPERTY_CID_A },
            {
              id: 2,
              propertyCid: "bafkreiFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFA",
            },
          ],
        ),
      ],
      index,
    );
    const answer = await run;
    expect(answer.claims.map((c) => c.text)).toEqual([
      "R-0001 qualifies. Roof age estimated from the year built.",
    ]);
    expect(answer.citations.map((c) => c.id)).toEqual([1]);
  });
});

// Ask in the map (AI mode), wire: citation coordinates, nearPlace and rows[] are built from the
// dispatch rows, never from model text.
describe("map wire: citation coordinates, nearPlace and rows[]", () => {
  it("a property citation carries the row's point and nearest place; rows[] marks the cited row", async () => {
    const index = new FakeLeadIndex([
      property(),
      property({ propertyCid: PROPERTY_CID_B, requestIdentifier: "R-0002", roofAgeYears: 20 }),
    ]);
    const { run } = ask(
      [
        planText(PFLUGERVILLE_PLAN),
        // The model tries to plant its own coordinates and place; they must be ignored.
        compose(
          [{ text: "R-0001 has a 32-year-old roof.", citationIds: [1] }],
          [{ id: 1, propertyCid: PROPERTY_CID_A, lat: 1, lon: 2, nearPlace: { name: "Mars" } }],
        ),
      ],
      index,
    );
    const answer = await run;
    expect(answer.citations[0]).toMatchObject({
      kind: "property",
      lat: 30.4418,
      lon: -97.6069,
      nearPlace: { name: "Pflugerville" },
    });
    expect(answer.rows).toHaveLength(2);
    expect(answer.rows?.[0]).toMatchObject({
      propertyCid: PROPERTY_CID_A,
      tcadId: "R-0001",
      lat: 30.4418,
      roofAgeYears: 32,
      roofAgeBasis: "built_year",
      citationId: 1,
      missing: [],
    });
    expect(answer.rows?.[1]?.citationId).toBeUndefined();
    expect(answerPins(answer)).toEqual([
      { n: 1, propertyCid: PROPERTY_CID_A, lat: 30.4418, lon: -97.6069 },
    ]);
  });

  it("a permit-intent answer: the permit citation takes its property's point; the row carries the permit", async () => {
    const index = new FakeLeadIndex([property()], [permit()]);
    const { run } = ask(
      [
        planText({
          intent: "find_permits",
          area: { kind: "place", query: "Pflugerville", radiusMi: 5 },
          filters: { statusClass: ["open"] },
        }),
        compose(
          [{ text: "Permit 2019-001234 has been open 2790 days.", citationIds: [1] }],
          [{ id: 1, permitCid: PERMIT_CID_P }],
        ),
      ],
      index,
    );
    const answer = await run;
    expect(answer.citations[0]).toMatchObject({
      kind: "permit",
      lat: 30.4418,
      lon: -97.6069,
      nearPlace: { name: "Pflugerville" },
    });
    expect(answer.rows?.[0]).toMatchObject({
      propertyCid: PROPERTY_CID_A,
      tcadId: "R-0001",
      citationId: 1,
      permit: {
        permitCid: PERMIT_CID_P,
        number: "2019-001234",
        statusClass: "open",
        openDays: 2790,
      },
    });
    expect(answer.rows?.[0]?.missing).toContainEqual(
      expect.objectContaining({ field: "contractor", reason: "contractor_unresolved" }),
    );
    // A permit citation pins at its property's point (a permit-only answer still shows where).
    expect(answerPins(answer)).toEqual([
      expect.objectContaining({ n: 1, lat: 30.4418, lon: -97.6069 }),
    ]);
  });

  it("a row without coordinates has no lat/lon and says why in missing", async () => {
    const noCoords = property({
      propertyCid: PROPERTY_CID_B,
      requestIdentifier: "R-0002",
      latitude: null,
      longitude: null,
      coordinateSource: "none",
      missingReasons: [{ field: "coordinates", reason: "no_coordinates" }],
    });
    // lookup_property reaches the row even though a radius search could not place it.
    const index = new FakeLeadIndex([noCoords]);
    const { run } = ask(
      [
        planText({
          intent: "lookup_property",
          area: { kind: "place", query: "R-0002", radiusMi: 5 },
        }),
        compose([{ text: "Property R-0002 is in this run.", citationIds: [1] }]),
      ],
      index,
    );
    const answer = await run;
    expect(answer.citations[0]?.lat).toBeUndefined();
    expect(answer.citations[0]?.nearPlace).toBeUndefined();
    expect(answer.rows?.[0]?.lat).toBeUndefined();
    expect(answer.rows?.[0]?.lon).toBeUndefined();
    expect(answer.rows?.[0]?.missing).toEqual([{ field: "coordinates", reason: "no_coordinates" }]);
    expect(answerPins(answer)).toEqual([]);
  });

  it("template citations carry coordinates too, and rows[] has at most 25 entries", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      property({
        propertyCid: `bafkrei${String(i).padStart(2, "0")}${"a".repeat(54)}`,
        requestIdentifier: `R-${String(i + 1).padStart(4, "0")}`,
      }),
    );
    const index = new FakeLeadIndex(many);
    const { run } = ask([planText(PFLUGERVILLE_PLAN), "not json"], index);
    const answer = await run;
    expect(answer.rows).toHaveLength(25);
    expect(answer.citations.every((c) => c.lat !== undefined)).toBe(true);
    expect(answer.rows?.filter((r) => r.citationId !== undefined)).toHaveLength(3);
  });

  it("answers with no rows (empty, out of scope) carry no rows[]", async () => {
    const index = new FakeLeadIndex([property({ roofAgeYears: 5 })]);
    const { run } = ask([planText(PFLUGERVILLE_PLAN)], index);
    expect((await run).rows).toBeUndefined();
  });
});
