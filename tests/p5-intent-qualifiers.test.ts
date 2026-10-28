import { it, expect } from "vitest";
import { interpretIntent, requireIntent } from "../packages/agent/src/intent";
import {
  answerWithBedrock,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import { createApp } from "../apps/api/src/app";
import {
  QuerySchema,
  CONTRACT_VERSION,
  type QueryInput,
} from "../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
const base = QuerySchema.parse({
  snapshotId: "synthetic-p5-qualifiers",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  ownerRegion: "any",
  includeUnknown: true,
  limit: 50,
});
const unsupported = [
  "Find properties with only unknown evidence",
  "Show only unknown evidence in this area",
  "Find only properties with unknown evidence",
  "Find only unknown evidence and roofs older than fifteen years",
  "Find only properties with listed contractors",
  "Show properties with listed contractors only",
  "Find properties with listed contractors",
  "Find only properties with available business license evidence",
  "Show only available license evidence",
  "Find properties with available business license evidence",
  "Find only properties with verified contractors where available",
  "Find properties requires verified contractors where available",
];
for (const prompt of unsupported)
  it("a material restriction cannot become a projection: " + prompt, () => {
    const p = interpretIntent(prompt, base);
    expect(p.accepted).toBe(false);
    expect(p.query).toBeUndefined();
    expect(
      p.ledger.some((x) => x.material && x.classification !== "applied"),
    ).toBe(true);
  });
const conditional = [
  "Show properties with BBB ratings where available",
  "Show properties with observed BBB ratings where observed",
  "Show properties with verified contractors where available",
  "Show properties with listed contractors where available",
  "Show properties with verified license observations where available",
  "Show properties with official high-confidence license evidence where observed",
  "Show properties having verified license observations where available",
  "Show available business license evidence where available",
];
for (const prompt of conditional)
  it("where-available facts do not require presence: " + prompt, () => {
    const p = requireIntent(prompt, base);
    expect(p.query.requiresContractor).toBeUndefined();
    expect(p.query.requiresVerifiedLicense).toBeUndefined();
    expect(p.query.requiresBbbRating).toBeUndefined();
    expect(
      p.ledger.some(
        (x) =>
          x.normalizedMeaning === "conditional_business_projection" &&
          !x.material &&
          x.classification === "descriptive",
      ),
    ).toBe(true);
  });
for (const [prompt, field] of [
  ["Find only regional owners", "ownerRegion"],
  ["Find only properties with verified contractors", "requiresContractor"],
  [
    "Find properties with only verified license observations",
    "requiresVerifiedLicense",
  ],
  ["Find only properties with BBB ratings", "requiresBbbRating"],
  ["Find only roofs older than fifteen years", "roofMinAgeYears"],
  ["Find only unknown permits", "permitStatus"],
] as const)
  it("only is ledgered against an actual applied predicate: " + prompt, () => {
    const p = requireIntent(prompt, base);
    expect(
      p.ledger.some(
        (x) =>
          x.normalizedMeaning === "only_bound_restriction" &&
          x.typedField === field &&
          x.material &&
          x.classification === "applied",
      ),
    ).toBe(true);
  });
it("a later conditional projection cannot weaken an earlier separate company requirement", () => {
  const p = requireIntent(
    "Find properties with verified contractors and BBB ratings where available",
    base,
  );
  expect(p.query.requiresContractor).toBe(true);
  expect(p.query.requiresBbbRating).toBeUndefined();
});
it("known unsupported only-qualifiers refuse before source or provider invocation", async () => {
  let reads = 0,
    providers = 0;
  const app = createApp({
    oracle: {
      search: async () => {
        reads++;
        throw Error("No source call allowed");
      },
      detail: async () => nonemptyEvidenceProperty,
    },
    leads: {
      list: () => [],
      create: () => {
        throw Error("No mutation");
      },
      update: () => {
        throw Error("No mutation");
      },
    },
    agent: async () => {
      providers++;
      throw Error("No provider allowed");
    },
  });
  for (const prompt of [
    unsupported[0],
    unsupported[1],
    unsupported[4],
    unsupported[7],
  ]) {
    const response = await app({
      method: "POST",
      path: "/api/agent",
      headers: {},
      body: { prompt, query: base },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.mode).toBe("refused-before-model");
    expect(body.intent.accepted).toBe(false);
  }
  expect({ reads, providers }).toEqual({ reads: 0, providers: 0 });
});
it("conditional business projections retain missing-evidence rows through one actual orchestration with a fake model", async () => {
  let reads = 0,
    calls = 0;
  const property = {
    ...nonemptyEvidenceProperty,
    coordinates: { lat: base.lat, lng: base.lng },
    permits: nonemptyEvidenceProperty.permits.map((p) => ({
      ...p,
      contractor: {
        reportedName: null,
        verifiedCompanyId: null,
        license: null,
        rating: null,
        licenseEvidence: null,
        ratingEvidence: null,
      },
    })),
  };
  const reader = {
    search: async (q: QueryInput) => {
      reads++;
      return {
        contractVersion: CONTRACT_VERSION,
        snapshotId: q.snapshotId,
        queryHash: "synthetic-qualified",
        rows: [{ ...property, distanceMeters: 0 }],
        total: 1,
        truncated: false,
        nextCursor: null,
        limitations: ["Synthetic missing business observations only"],
      };
    },
    detail: async () => property,
  };
  const provider: ConverseTransport = {
    converse: async (request) => {
      calls++;
      const q = JSON.parse(request.messages![0].content![0].text!).boundedQuery;
      expect(q.requiresContractor).toBeUndefined();
      expect(q.requiresVerifiedLicense).toBeUndefined();
      expect(q.requiresBbbRating).toBeUndefined();
      return {
        $metadata: {},
        metrics: { latencyMs: 0 },
        usage: { inputTokens: 20, outputTokens: 20, totalTokens: 40 },
        stopReason: "tool_use",
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "synthetic",
                  name: "selectGroundedEvidence",
                  input: {
                    ordinals: [0],
                  },
                },
              },
            ],
          },
        },
      };
    },
  };
  for (const prompt of conditional.slice(0, 7)) {
    const answer = await answerWithBedrock(reader, provider, prompt, base, {
      modelId: "synthetic",
    });
    expect(answer.results).toHaveLength(1);
    expect(answer.intent?.accepted).toBe(true);
  }
  expect({ reads, calls }).toEqual({ reads: 7, calls: 7 });
});
