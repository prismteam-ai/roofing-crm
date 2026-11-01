import { describe, it, expect } from "vitest";
import {
  interpretIntent,
  requireIntent,
  IntentRejection,
  IntentPlanSchema,
} from "../packages/agent/src/intent";
import { P5_NL_CORPUS } from "../packages/agent/src/intent/corpus";
import { officialPlaceResolver } from "../packages/places/src/index";
import { QuerySchema } from "../packages/contracts/src/index";
const base = QuerySchema.parse({
  snapshotId: "synthetic-p5-intent",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  ownerRegion: "any",
  includeUnknown: true,
  limit: 50,
});
describe("P5 finite deterministic intent corpus", () => {
  it("contains at least80 distinct cases and critical original/predicate classes", () => {
    expect(P5_NL_CORPUS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(P5_NL_CORPUS.map((x) => x.id)).size).toBe(
      P5_NL_CORPUS.length,
    );
    expect(new Set(P5_NL_CORPUS.map((x) => x.prompt)).size).toBe(
      P5_NL_CORPUS.length,
    );
    for (const category of [
      "original-oracle",
      "original-crm",
      "place",
      "radius",
      "roof",
      "owner",
      "reported-sale",
      "contractor",
      "license",
      "bbb",
      "sort",
      "limit",
      "tenure",
      "injection",
    ])
      expect(P5_NL_CORPUS.some((x) => x.classes.includes(category))).toBe(true);
  });
  for (const item of P5_NL_CORPUS)
    it(item.id + ": " + item.prompt, () => {
      const current = { ...base, ...item.base };
      const plan = interpretIntent(item.prompt, current);
      expect(
        plan.accepted,
        JSON.stringify(
          plan.ledger.filter(
            (x) => x.material && x.classification !== "applied",
          ),
        ),
      ).toBe(item.expected === "accepted");
      if (item.expected === "accepted") {
        for (const [key, value] of Object.entries(item.query ?? {}))
          expect(
            plan.query?.[key as keyof NonNullable<typeof plan.query>],
          ).toEqual(value);
        expect(
          plan.ledger
            .filter((x) => x.material)
            .every((x) => x.classification === "applied"),
        ).toBe(true);
        if (item.query?.placeId) {
          const reference = officialPlaceResolver.get(item.query.placeId)!;
          expect(plan.placeResolution).toEqual(reference);
          expect(plan.query).toMatchObject({
            lat: reference.center.lat,
            lng: reference.center.lng,
            placeId: reference.placeId,
            placeIndexDigest: reference.indexDigest,
          });
        }
        for (let i = 0; i < item.prompt.length; i++)
          if (/[\p{L}\p{N}]/u.test(item.prompt[i]))
            expect(
              plan.ledger.some(
                (x) => x.origin === "prompt" && x.start <= i && x.end > i,
              ),
              "Unaccounted character " + item.prompt.slice(i),
            ).toBe(true);
        for (const entry of plan.ledger.filter((x) => x.origin === "prompt"))
          expect(entry.rawSpan).toBe(item.prompt.slice(entry.start, entry.end));
      } else {
        expect(plan.query).toBeUndefined();
        expect(
          plan.ledger.some((x) => x.material && x.classification !== "applied"),
        ).toBe(true);
        expect(() => requireIntent(item.prompt, current)).toThrow(
          IntentRejection,
        );
      }
    });
});
describe("No-silent-drop mutation and conjunction properties", () => {
  it("the ledger schema cannot mark a blocked/no-query plan executable", () => {
    const rejected = interpretIntent(
      "Find properties with BBB ratings above 80",
      base,
    );
    expect(
      IntentPlanSchema.safeParse({ ...rejected, accepted: true }).success,
    ).toBe(false);
    const accepted = requireIntent("Find roofs older than 15", base);
    expect(
      IntentPlanSchema.safeParse({ ...accepted, accepted: false }).success,
    ).toBe(false);
    const damaged = {
      ...accepted,
      ledger: accepted.ledger.map((x, i) =>
        i === accepted.ledger.length - 1 ? { ...x, end: x.end + 1 } : x,
      ),
    };
    expect(IntentPlanSchema.safeParse(damaged).success).toBe(false);
  });
  it("refuses conjunctions of different explicit current and named centers", () => {
    const p = interpretIntent(
      "Find properties near Troy and near this area",
      base,
    );
    expect(p.accepted).toBe(false);
    expect(
      p.ledger.some(
        (x) =>
          x.normalizedMeaning === "center_reference_conflict" &&
          x.classification === "conflicting",
      ),
    ).toBe(true);
    const place = officialPlaceResolver.get("us-26-125-80700-city")!;
    expect(
      requireIntent("Find properties near Troy and near this area", {
        ...base,
        ...place.center,
      }).accepted,
    ).toBe(true);
  });
  it("preserves explicit unknown-age exclusion introduced by but", () => {
    const p = requireIntent(
      "Find roofs older than 15 but do not include unknown roof ages",
      base,
    );
    expect(p.query).toMatchObject({
      roofMinAgeYears: 15,
      includeUnknown: false,
    });
  });
  it("refuses stalled-work claims instead of equating them to observed open status", () => {
    const p = interpretIntent(
      "Find stalled roofing permits older than five years",
      base,
    );
    expect(p.accepted).toBe(false);
    expect(
      p.ledger.some(
        (x) =>
          x.normalizedMeaning === "stalled_work" &&
          x.classification === "unsupported",
      ),
    ).toBe(true);
  });
  it.each(["closed", "unknown"])(
    "refuses %s status with explicit open-duration order",
    (status) => {
      const p = interpretIntent(
        "Show " + status + " permits sorted by permit open days descending",
        base,
      );
      expect(p.accepted).toBe(false);
      expect(
        p.ledger.some(
          (x) =>
            x.normalizedMeaning === "duration_sort_status_conflict" &&
            x.classification === "conflicting",
        ),
      ).toBe(true);
    },
  );
  for (const seed of P5_NL_CORPUS.filter(
    (x) => x.expected === "accepted",
  ).slice(0, 20)) {
    for (const suffix of [
      " and BBB rating above 99",
      " and excluding this area",
      " and unchanged ownership for ten years",
      " and qzunsupported predicate",
    ]) {
      it(seed.id + " cannot swallow " + suffix, () => {
        const p = interpretIntent(seed.prompt + suffix, {
          ...base,
          ...seed.base,
        });
        expect(p.accepted).toBe(false);
        expect(
          p.ledger.some(
            (x) =>
              x.material &&
              x.classification !== "applied" &&
              x.end > seed.prompt.length,
          ),
        ).toBe(true);
      });
    }
  }
  it("honors explicit radius/limit changes instead of replacing them with current minima", () => {
    for (const radius of [1, 3, 5, 10, 20])
      for (const limit of [1, 5, 20, 50]) {
        const plan = requireIntent(
          "Find properties within " + radius + " miles limit " + limit,
          { ...base, radiusMeters: 1609.344, limit: 1 },
        );
        expect(plan.query.radiusMeters).toBe(radius * 1609.344);
        expect(plan.query.limit).toBe(limit);
      }
  });
  it("isolates permit duration from later sale-age clauses", () => {
    const p = requireIntent(
      "Show roofing permits for properties with last reported sale older than ten years",
      base,
    );
    expect(p.query.minReportedSaleAgeYears).toBe(10);
    expect(p.query.minOpenDays).toBe(0);
    expect(p.query.permitStatus).toBe("any");
  });
  it("bounds a pathological ledger by explicit refusal, never silent truncation", () => {
    const p = interpretIntent(
      "Find " + Array(150).fill("properties").join(" "),
      base,
    );
    expect(p.accepted).toBe(false);
    expect(p.ledger.length).toBeLessThanOrEqual(120);
  });
});
