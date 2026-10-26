// T024 (B-09, Phase 4/US1): failing-first unit test for `resolvePlace`/place-confidence scoring
// (ADR-06 §5/§10 pattern #3, docs/decisions/0000-agent-architecture.md). `apps/api/src/services/
// agent/placeResolver.ts` does not exist yet when this test is first run — it must fail on
// import, then T030 makes it pass.
//
// Three things this task asks for, each isolated in its own describe block:
//   1. an exact match scores 1.0
//   2. a misspelling ("Pflugervile") scores in the fuzzy range (< 1.0, clearly not garbage)
//   3. two close candidates land within the margin<0.05 clarify band
//
// (3) uses `rankCandidates` directly with a synthetic name list rather than the real 31-place
// Travis gazetteer: the margin<0.05 behavior is a property of the scoring/ranking function
// itself, not of there happening to be two near-duplicate real Travis place names, so testing it
// this way is decoupled from the gazetteer's actual contents (and remains valid if the gazetteer
// is ever regenerated).
import { describe, expect, it } from "vitest";
import { classifyPlaceConfidence } from "@crm/shared";
import { createPlaceResolver, rankCandidates } from "../../../src/services/agent/placeResolver.js";

/** Indexes a ranked list, failing the test loudly instead of using a non-null assertion. */
function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`expected a candidate at index ${i}`);
  return item;
}

describe("placeResolver: exact/alias match", () => {
  it("scores an exact Travis place name 1.0, match kind 'exact'", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("Pflugerville");

    expect(resolution.status).toBe("resolved");
    expect(resolution.source).toBe("travis-places@1.0.0");
    expect(resolution.candidates[0]).toMatchObject({
      match: "exact",
      score: 1,
      lat: expect.closeTo(30.447765, 5),
      lon: expect.closeTo(-97.602116, 5),
    });
  });

  it("scores a case/LSAD variant 1.0 too (ADR-06 §5: exact OR alias = 1.0) — both are the gazetteer's own canonical match, labelled 'exact' ('alias' is reserved for a learned review alias, ADR §7)", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("PFLUGERVILLE CITY");

    expect(resolution.status).toBe("resolved");
    expect(resolution.candidates[0]).toMatchObject({ match: "exact", score: 1 });
  });

  it("scores a ZIP in the Travis ZCTA list 1.0, match kind 'zip'", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("78753");

    expect(resolution.status).toBe("resolved");
    expect(resolution.candidates[0]).toMatchObject({ match: "zip", score: 1 });
  });

  it("a 5-digit code outside the Travis ZCTA list is out_of_scope, not fuzzy-matched", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("99999");

    expect(resolution.status).toBe("out_of_scope");
    expect(resolution.candidates).toEqual([]);
  });
});

describe("placeResolver: misspelling scores in the fuzzy range", () => {
  it("'Pflugervile' (one letter short) resolves fuzzy, below 1.0, above the clarify floor", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("Pflugervile");

    expect(resolution.status).toBe("resolved");
    const top = resolution.candidates[0];
    expect(top?.match).toBe("fuzzy");
    expect(top?.score).toBeLessThan(1);
    expect(top?.score).toBeGreaterThan(0.8);
    expect(top?.name.toLowerCase()).toContain("pflugerville");
  });

  it("returns at most 3 candidates, best-first by score", async () => {
    const resolver = createPlaceResolver();
    const resolution = await resolver.resolve("Pflugervile");

    expect(resolution.candidates.length).toBeLessThanOrEqual(3);
    const scores = resolution.candidates.map((c) => c.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("rankCandidates: the pure scoring/ranking step behind the margin<0.05 clarify band", () => {
  it("ranks an exact candidate 1.0, strictly ahead of any other candidate", () => {
    const ranked = rankCandidates("Austin", ["Austin", "Elgin", "Manor"]);
    expect(ranked[0]).toMatchObject({ name: "Austin", score: 1 });
    expect(at(ranked, 0).score).toBeGreaterThan(at(ranked, 1).score);
  });

  it("two equally-plausible misspelled candidates land within 0.05 of each other (clarify band)", () => {
    // "Elgn" is one dropped letter from both "Elgin" and "Elgen" alike — a deliberately
    // symmetric case, so the ranking function (not a coincidence of real place names) is what's
    // under test.
    const ranked = rankCandidates("Elgn", ["Elgin", "Elgen", "Round Rock"]);
    const [first, second] = ranked;
    expect(new Set([first?.name, second?.name])).toEqual(new Set(["Elgin", "Elgen"]));

    const margin = at(ranked, 0).score - at(ranked, 1).score;
    expect(margin).toBeLessThan(0.05);
    // thresholds.ts (T011) is the thing that actually turns this score+margin into a band;
    // asserting it here ties the two fixtures together instead of re-deriving the band inline.
    expect(classifyPlaceConfidence(at(ranked, 0).score, margin)).toBe("clarify");
  });

  it("a clear top candidate (large margin) is in the auto band, not clarify", () => {
    const ranked = rankCandidates("Austin", ["Austin", "Round Rock", "Lakeway"]);
    const margin = at(ranked, 0).score - at(ranked, 1).score;
    expect(classifyPlaceConfidence(at(ranked, 0).score, margin)).toBe("auto");
  });
});

// B-09 review finding 7 (CR-B-09 row 16, alakazam): candidate quality for the clarify buttons and
// the ADR-06 §5 bands.
describe("placeResolver: candidates are distinct places, and short/foreign names don't over-score", () => {
  it("an exact hit never lists the same place again as a fuzzy runner-up ('Manor' vs 'Manor city')", async () => {
    const resolution = await createPlaceResolver().resolve("Manor");
    const [top, ...rest] = resolution.candidates;
    expect(top).toMatchObject({ match: "exact", score: 1 });
    for (const other of rest) {
      expect(other.lat !== top?.lat || other.lon !== top?.lon).toBe(true);
    }
  });

  it("a fuzzy result lists each place once", async () => {
    const resolution = await createPlaceResolver().resolve("Pflugervile");
    const points = resolution.candidates.map((c) => `${c.lat},${c.lon}`);
    expect(new Set(points).size).toBe(points.length);
  });

  it("a non-Travis name that only shares a prefix ('San Marcos' vs 'San Leanna') stays below the clarify floor", async () => {
    // Winkler's prefix boost applies only when the Jaro score is already >= 0.7 (Winkler 1990's
    // boost threshold); without it 'San ' alone lifted San Leanna to exactly 0.80 (clarify).
    const resolution = await createPlaceResolver().resolve("San Marcos");
    expect(resolution.candidates[0]?.score ?? 0).toBeLessThan(0.8);
  });

  it.each([
    ["Kyle", "not_found"],
    ["Hutto", "not_found"],
    ["Elgn", "auto"],
    ["Lakewy", "auto"],
  ])("'%s' bands as %s", async (query, band) => {
    const resolution = await createPlaceResolver().resolve(query);
    const [top, second] = resolution.candidates;
    const margin = (top?.score ?? 0) - (second?.score ?? 0);
    const got = classifyPlaceConfidence(top?.score ?? 0, margin);
    expect(got).toBe(band === "not_found" ? "refuse" : band);
  });
});
