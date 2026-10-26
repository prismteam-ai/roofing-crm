// B-09 review (CR-B-09 findings 16 and 20): the Ask screen's wording is derived from the answer itself —
// `plan`, `counts`, `missing[]`, `retryAfterSec`, `resetsAt`, `candidates` — never hard-coded
// place names, limits or reset times. These are the pure helpers behind that copy.
import { AGENT_TURN_LIMIT_MS, type AgentAnswer } from "@crm/shared";
import { describe, expect, it } from "vitest";
import {
  AGENT_TURN_LIMIT_SEC,
  clarifyQuestion,
  confirmErrorCopy,
  emptyExplanation,
  exclusionNotes,
  fieldNotPublishedText,
  hasModelPlan,
  missingText,
  pausedText,
  planSummary,
  throttleText,
  timedOutText,
  composerNote,
  SUGGESTIONS,
  matchesEmptyText,
  pinsNote,
  answerMatchTotal,
  distinctAnswerRows,
  answerShowsDistance,
  rowNearText,
  rowPermitText,
  rowRoofText,
  rowSignal,
  coverageNote,
  nextRadius,
  offersWiden,
  widenQuestion,
} from "../../src/routes/Ask/askCopy";

type Row = NonNullable<AgentAnswer["rows"]>[number];
const row = (over: Partial<Row> = {}): Row => ({
  propertyCid: "bafkprop1",
  tcadId: "0200314187",
  missing: [],
  ...over,
});

type Plan = AgentAnswer["plan"];

const PERMIT_PLAN: Plan = {
  intent: "find_permits",
  area: {
    kind: "place",
    query: "pflugervile",
    radiusMi: 5,
    resolved: {
      name: "Pflugerville",
      lat: 30.44,
      lon: -97.62,
      source: "travis-places@1.0.0",
      sha256: "abc",
      match: "fuzzy",
      score: 0.95,
    },
  },
  filters: { statusClass: ["open"], openYearsMin: 5 },
  slotSources: { area: "stated", statusClass: "stated", openYearsMin: "stated" },
  unsupported: [],
};

function answer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    outcome: "empty_in_scope",
    claims: [],
    citations: [],
    plan: PERMIT_PLAN,
    resultSetId: "rs",
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
      toolSteps: 1,
      modelCalls: 1,
    },
    ...overrides,
  };
}

describe("hasModelPlan (CR finding 16: 'How I read this' only when a model plan exists)", () => {
  it.each([
    "answered",
    "empty_in_scope",
    "field_not_published",
    "not_found",
    "out_of_scope",
  ] as const)("is true for %s", (outcome) => {
    expect(hasModelPlan(answer({ outcome }))).toBe(true);
  });

  it.each(["rate_limited", "paused", "timed_out"] as const)("is false for %s", (outcome) => {
    expect(hasModelPlan(answer({ outcome }))).toBe(false);
  });

  it("is true for needs_clarification from the scope gate (candidates sent, even empty)", () => {
    expect(hasModelPlan(answer({ outcome: "needs_clarification", candidates: [] }))).toBe(true);
  });

  it("is false for needs_clarification after an unreadable plan (no candidates field)", () => {
    expect(hasModelPlan(answer({ outcome: "needs_clarification" }))).toBe(false);
  });
});

describe("planSummary", () => {
  it("uses the resolved place name, radius and filters from the plan", () => {
    expect(planSummary(PERMIT_PLAN)).toBe(
      "open roofing permits, open 5+ years, within 5 mi of Pflugerville",
    );
  });

  it("falls back to what the rep typed when the place was not resolved", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      area: { kind: "place", query: "Lakeview Heights", radiusMi: 3 },
    };
    expect(planSummary(plan)).toContain("within 3 mi of Lakeview Heights");
  });

  it("names a county-wide area without a radius", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      intent: "find_properties",
      area: { kind: "county", query: "Travis County", radiusMi: 25 },
      filters: { roofAgeMinYears: 20 },
    };
    expect(planSummary(plan)).toBe("properties, roof 20+ years old, in Travis County");
  });
});

describe("emptyExplanation (CR finding 16: empty copy says why)", () => {
  it("states the subject, filters and area actually searched", () => {
    expect(emptyExplanation(answer())).toBe(
      "No open roofing permits, open 5+ years, within 5 mi of Pflugerville.",
    );
  });

  it("does not hard-code a place: a different plan yields a different sentence", () => {
    const plan: Plan = {
      ...PERMIT_PLAN,
      intent: "find_properties",
      area: { kind: "place", query: "Manor", radiusMi: 1 },
      filters: { roofAgeMinYears: 30 },
    };
    expect(emptyExplanation(answer({ plan }))).toBe(
      "No properties, roof 30+ years old, within 1 mi of Manor.",
    );
  });
});

describe("exclusionNotes", () => {
  it("explains counted exclusions with their numbers", () => {
    const notes = exclusionNotes(
      answer({
        counts: {
          matched: 0,
          shown: 0,
          excludedNoCoordinates: 2,
          excludedNoRoofDate: 1,
          truncated: false,
        },
      }),
    );
    expect(notes).toEqual([
      "1 property in the area has no roof date, so the roof-age filter left it out.",
      "2 indexed properties have no coordinates, so a radius search can't place them.",
    ]);
  });

  it("is empty when nothing was excluded", () => {
    expect(exclusionNotes(answer())).toEqual([]);
  });
});

describe("missingText", () => {
  it("uses the contract label and the evidence-row count", () => {
    expect(missingText({ field: "coordinates", reason: "no_coordinates", count: 4 })).toBe(
      "Coordinates: No coordinates for this parcel (4 rows)",
    );
  });

  it("labels the plan-level no_free_text reason (not in the row-reason list)", () => {
    expect(missingText({ field: "permit description", reason: "no_free_text" })).toBe(
      "Permit description: Free text is not published",
    );
  });

  it("singular row count", () => {
    expect(missingText({ field: "roof date", reason: "no_roof_date", count: 1 })).toBe(
      "Roof date: No roof date found (1 row)",
    );
  });
});

describe("fieldNotPublishedText", () => {
  it("names each unpublished field and that Task A does not publish it", () => {
    const text = fieldNotPublishedText(
      answer({
        outcome: "field_not_published",
        missing: [
          { field: "contractor license", reason: "no_lexicon_carrier" },
          { field: "permit description", reason: "not_in_export" },
        ],
      }),
    );
    expect(text).toBe(
      "Task A's published data (CountyLens) doesn't include contractor license or permit " +
        "description, so I can't filter on them. Nothing was searched.",
    );
  });

  it("singular", () => {
    const text = fieldNotPublishedText(
      answer({
        outcome: "field_not_published",
        missing: [{ field: "roof material", reason: "not_in_export" }],
      }),
    );
    expect(text).toContain("doesn't include roof material, so I can't filter on it.");
  });
});

describe("throttleText (countdown from retryAfterSec)", () => {
  it("counts down in seconds", () => {
    expect(throttleText(40)).toBe("Ask again in 40 s. The map and your leads keep working.");
  });
  it("names the last answer only when it is still on screen", () => {
    expect(throttleText(40, true)).toBe(
      "Ask again in 40 s. Your last answer, the map and your leads keep working.",
    );
  });
  it("says you can ask again at zero", () => {
    expect(throttleText(0)).toBe("You can ask again now.");
  });
  it("says why when the wait was not sent", () => {
    expect(throttleText(undefined)).toBe(
      "Wait a moment, then ask again. This answer didn't include the wait time.",
    );
  });
});

describe("pausedText (reset time from resetsAt, local + UTC)", () => {
  it("renders the viewer's local time and the UTC time", () => {
    expect(
      pausedText("2026-10-25T00:00:00.000Z", { locale: "en-US", timeZone: "America/Chicago" }),
    ).toBe(
      "Today's question budget is used up. Asking resumes Oct 24, 2026, 7:00 PM your time " +
        "(2026-10-25 00:00 UTC). Map, filters and leads keep working.",
    );
  });
  it("says why when the reset time was not sent", () => {
    expect(pausedText(undefined)).toBe(
      "Today's question budget is used up. This answer didn't include the reset time. Map, " +
        "filters and leads keep working.",
    );
  });
});

describe("timedOutText", () => {
  it("takes the limit from the shared constant, not a literal", () => {
    expect(timedOutText()).toContain(`${AGENT_TURN_LIMIT_SEC} s limit`);
  });

  it("derives the seconds from @crm/shared's AGENT_TURN_LIMIT_MS (the server's abort timer)", () => {
    expect(AGENT_TURN_LIMIT_SEC).toBe(AGENT_TURN_LIMIT_MS / 1000);
    expect(timedOutText()).toContain(`${AGENT_TURN_LIMIT_MS / 1000} s limit`);
  });
});

describe("clarifyQuestion (re-ask with the chosen place made explicit)", () => {
  it("replaces the ambiguous place the rep typed with the chosen candidate", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "pville", radiusMi: 5 } };
    expect(clarifyQuestion("open permits within 5 miles of Pville", plan, "Pflugerville")).toBe(
      "open permits within 5 miles of Pflugerville",
    );
  });

  it("appends the place when the typed text is not in the question", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "", radiusMi: 5 } };
    expect(clarifyQuestion("old roofs nearby", plan, "Manor")).toBe(
      "old roofs nearby (place: Manor)",
    );
  });

  it("treats regex characters in the typed place literally", () => {
    const plan: Plan = { ...PERMIT_PLAN, area: { kind: "place", query: "st. (x)", radiusMi: 5 } };
    expect(clarifyQuestion("roofs near st. (x)", plan, "Sunset Valley")).toBe(
      "roofs near Sunset Valley",
    );
  });
});

describe("confirmErrorCopy (typed confirmLead errors)", () => {
  const err = (appCode?: string, code?: string) => ({ data: { appCode, code } });

  it("NOT_PROPOSED is specific and not retryable", () => {
    const copy = confirmErrorCopy(err("NOT_PROPOSED", "FORBIDDEN"));
    expect(copy.text).toMatch(/wasn't proposed in this conversation/);
    expect(copy.retryable).toBe(false);
    expect(copy.status).toBe("error");
  });

  it("NO_COORDINATES says the property has no published coordinates", () => {
    const copy = confirmErrorCopy(err("NO_COORDINATES", "PRECONDITION_FAILED"));
    expect(copy.text).toMatch(/no published coordinates/);
    expect(copy.retryable).toBe(false);
  });

  it("RATE_LIMITED asks to wait and is retryable", () => {
    const copy = confirmErrorCopy(err("RATE_LIMITED", "TOO_MANY_REQUESTS"));
    expect(copy.text).toMatch(/Too many lead requests/);
    expect(copy.retryable).toBe(true);
  });

  it("ALREADY_EXISTS is an info outcome, not a failure", () => {
    const copy = confirmErrorCopy(err("ALREADY_EXISTS", "CONFLICT"));
    expect(copy.status).toBe("info");
    expect(copy.text).toBe("Already a lead");
  });

  it("anything else says nothing was saved", () => {
    const copy = confirmErrorCopy(new Error("boom"));
    expect(copy.text).toBe("Couldn't create the lead. Nothing was saved. Try again.");
    expect(copy.retryable).toBe(true);
  });
});

describe("composerNote (the run the answers cite)", () => {
  it("names the promoted run from the data pointer", () => {
    expect(composerNote("3")).toBe("Signed in · answers cite CountyLens run 3");
  });
  it("does not invent a run number when the pointer is not known", () => {
    expect(composerNote(null)).toBe("Signed in · answers cite the published CountyLens run");
    expect(composerNote(undefined)).not.toMatch(/run \d/);
  });
});

describe("SUGGESTIONS", () => {
  it("is example questions only", () => {
    expect(SUGGESTIONS.length).toBeGreaterThanOrEqual(5);
    expect(SUGGESTIONS.length).toBeLessThanOrEqual(6);
    expect(SUGGESTIONS.every((q) => q.length <= 500)).toBe(true);
  });
});

describe("Matches rows (Answer | Matches tab)", () => {
  it("near {place} with the distance, only when the row carries it", () => {
    expect(rowNearText(row({ nearPlace: { name: "Pflugerville", distanceMi: 1.26 } }))).toBe(
      "near Pflugerville · 1.3 mi",
    );
    expect(rowNearText(row())).toBeUndefined();
  });

  it("roof age with its basis in words", () => {
    expect(rowRoofText(row({ roofAgeYears: 24, roofAgeBasis: "permit" }))).toBe(
      "Roof 24 yrs · Last reroof permit",
    );
    expect(rowRoofText(row({ roofAgeYears: 24 }))).toBe("Roof 24 yrs");
    expect(rowRoofText(row({ roofAgeYears: 24, roofAgeConfidence: "low" }))).toBe(
      "Roof 24 yrs · Low confidence",
    );
    expect(
      rowRoofText(row({ roofAgeYears: 24, roofAgeBasis: "permit", roofAgeConfidence: "high" })),
    ).toBe("Roof 24 yrs · Last reroof permit · High confidence");
    expect(rowRoofText(row())).toBeUndefined();
  });

  it("permit status (stalled is derived) and open years from openDays", () => {
    expect(
      rowPermitText(
        row({
          permit: { permitCid: "p", number: "2019-1", statusClass: "stalled", openDays: 2338 },
        }),
      ),
    ).toBe("Stalled · derived: no status in source · open 6.4 yrs");
    expect(
      rowPermitText(row({ permit: { permitCid: "p", number: null, statusClass: null } })),
    ).toBe("Status not published");
    expect(rowPermitText(row())).toBeUndefined();
  });

  it("says why there is nothing to list", () => {
    expect(matchesEmptyText(undefined)).toMatch(/did not include a list of matches/);
    expect(matchesEmptyText([])).toBe("No matches to list for this question.");
  });
});

describe("pinsNote (why a map pin is missing)", () => {
  const cite = (id: number, extra: Partial<AgentAnswer["citations"][number]> = {}) =>
    ({
      id,
      kind: "property",
      propertyCid: `cid${String(id)}`,
      sourceUrl: null,
      capturedAt: "2026-10-20T00:00:00Z",
      tableCid: "t",
      manifestCid: "m",
      asOf: "2026-10-20",
      ...extra,
    }) as AgentAnswer["citations"][number];

  it("is silent when every cited property has a pin", () => {
    expect(pinsNote([cite(1, { lat: 30, lon: -97 })], 1)).toBeUndefined();
  });
  it("names the case where none has coordinates", () => {
    expect(pinsNote([cite(1), cite(2)], 0)).toBe(
      "No map pins: none of the cited properties has published coordinates.",
    );
  });
  it("counts the ones without a pin when some have one", () => {
    expect(pinsNote([cite(1, { lat: 30, lon: -97 }), cite(2)], 1)).toBe(
      "1 of 2 cited properties has no published coordinates, so it has no pin.",
    );
  });
  it("says when the answer cites no property", () => {
    expect(pinsNote([], 0)).toBe("No map pins: this answer cites no property.");
  });
});

describe("rowSignal (the confirmation sheet's main signal)", () => {
  it("prefers the permit, then the roof, then says nothing is published", () => {
    expect(
      rowSignal(
        row({ permit: { permitCid: "p", number: null, statusClass: "open", openDays: 730 } }),
      ),
    ).toBe("Open · open 2.0 yrs");
    expect(rowSignal(row({ roofAgeYears: 31 }))).toBe("Roof 31 yrs");
    expect(rowSignal(row())).toBe("No roof or permit signal published");
    expect(rowSignal(undefined)).toBe("No roof or permit signal published");
  });
});

const withRadius = (radiusMi: number, kind: Plan["area"]["kind"] = "place"): Plan => ({
  ...PERMIT_PLAN,
  area: { ...PERMIT_PLAN.area, radiusMi, kind },
});
const matched = (n: number): AgentAnswer["counts"] => ({
  matched: n,
  shown: n,
  excludedNoCoordinates: 0,
  excludedNoRoofDate: 0,
  truncated: false,
});

describe("nextRadius (K6: the next step above the current radius, never past the 25 mi cap)", () => {
  it.each([
    [0.5, 1],
    [1, 2],
    [3, 5],
    [5, 10],
    [10, 25],
    [12.5, 25],
  ])("%s mi widens to %s mi", (from, to) => {
    expect(nextRadius(from)).toBe(to);
  });
  it("offers nothing at or above the cap", () => {
    expect(nextRadius(25)).toBeUndefined();
  });
});

describe("offersWiden (K6: only a radius search with no or few matches, below the cap)", () => {
  it("is on for an empty radius search and for a few matches", () => {
    expect(offersWiden(answer({ plan: withRadius(5) }))).toBe(true);
    expect(
      offersWiden(answer({ outcome: "answered", plan: withRadius(5), counts: matched(4) })),
    ).toBe(true);
  });
  it("is off with many matches, at the cap, for a county, and for other outcomes", () => {
    expect(
      offersWiden(answer({ outcome: "answered", plan: withRadius(5), counts: matched(40) })),
    ).toBe(false);
    expect(offersWiden(answer({ plan: withRadius(25) }))).toBe(false);
    expect(offersWiden(answer({ plan: withRadius(5, "county") }))).toBe(false);
    expect(offersWiden(answer({ outcome: "out_of_scope", plan: withRadius(5) }))).toBe(false);
    expect(offersWiden(answer({ outcome: "needs_clarification", plan: withRadius(5) }))).toBe(
      false,
    );
  });
});

describe("widenQuestion (K6: a follow-up text, because agent.ask has no structured plan edit)", () => {
  it("keeps the rep's question and names the wider radius", () => {
    expect(widenQuestion("open permits near Manor", 10)).toBe(
      "open permits near Manor (use a radius of 10 miles instead)",
    );
  });
  it("never exceeds the 500 character limit", () => {
    const long = "x".repeat(500);
    const text = widenQuestion(long, 25);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text.endsWith("(use a radius of 25 miles instead)")).toBe(true);
  });
});

describe("coverageNote (K7: honest, says only what the answer carries)", () => {
  const permitRow = row({
    permit: { permitCid: "p1", number: "1", statusClass: "stalled", openDays: 100 },
  });
  it("is absent when the answer carries no permit", () => {
    expect(coverageNote(answer({ rows: [row()] }), "3")).toBeUndefined();
  });
  it("names the run, says no jurisdiction list came with the answer, claims nothing about areas", () => {
    const text = coverageNote(answer({ rows: [permitRow] }), "3") ?? "";
    expect(text).toMatch(/CountyLens run 3/);
    expect(text).toMatch(/no jurisdiction/i);
    expect(text).not.toMatch(/Austin|Pflugerville|Manor|unpublished/);
  });
  it("also applies when only a citation is a permit, and without a run id", () => {
    const base = answer();
    const citation = {
      id: 1,
      kind: "permit" as const,
      sourceUrl: null,
      capturedAt: "2026-10-20T00:00:00Z",
      tableCid: "t",
      manifestCid: "m",
      asOf: "2026-10-20",
    };
    expect(coverageNote({ ...base, citations: [citation] }, null)).toMatch(
      /published CountyLens run/,
    );
  });
});

describe("permit-only pins note and one-property matches", () => {
  it("a cited permit with its property counts as a cited property, not 'cites no property'", () => {
    const permitCite = {
      id: 1,
      kind: "permit",
      propertyCid: "cid1",
      permitCid: "p1",
      sourceUrl: null,
      capturedAt: "2026-10-20T00:00:00Z",
      tableCid: "t",
      manifestCid: "m",
      asOf: "2026-10-20",
    } as AgentAnswer["citations"][number];
    expect(pinsNote([{ ...permitCite, lat: 30, lon: -97 }], 1)).toBeUndefined();
    expect(pinsNote([permitCite], 0)).toBe(
      "No map pins: none of the cited properties has published coordinates.",
    );
  });

  const rowOf = (over: Record<string, unknown>) =>
    ({ propertyCid: "c1", tcadId: "181990", missing: [], ...over }) as NonNullable<
      AgentAnswer["rows"]
    >[number];

  it("a property row plus its permit row is one match, listed once with the permit", () => {
    const rows = [
      rowOf({ citationId: 1 }),
      rowOf({ permit: { permitCid: "p1", number: "2001-1 BP", statusClass: "stalled" } }),
    ];
    const merged = distinctAnswerRows(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.permit?.number).toBe("2001-1 BP");
    expect(merged[0]?.citationId).toBe(1);
    const answer = {
      counts: { matched: 1, shown: 1 },
      rows,
      plan: { intent: "lookup_property" },
    } as unknown as AgentAnswer;
    expect(answerMatchTotal(answer)).toBe(1);
    expect(answerShowsDistance(answer)).toBe(false);
  });
});

describe("planSummary: a property question with a permit condition (follow-up)", () => {
  it("lists the permit condition with the other filters", () => {
    const plan = {
      intent: "find_properties",
      area: { kind: "place", query: "Lakeway", radiusMi: 2 },
      filters: { roofAgeMinYears: 25, statusClass: ["open"] },
      slotSources: {},
      unsupported: [],
    } as unknown as Parameters<typeof planSummary>[0];
    expect(planSummary(plan)).toBe(
      "properties, with an open or stalled permit, roof 25+ years old, within 2 mi of Lakeway",
    );
  });
});
