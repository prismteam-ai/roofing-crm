import { expect, it, vi } from "vitest";
import {
  calendarAgeThresholdDays,
  SOURCE_ASSESSMENT_DATE,
} from "../packages/agent/src/intent/source-calendar";
import { interpretIntent } from "../packages/agent/src/intent";
import { answerWithBedrock } from "../packages/agent/src/bedrock";
import {
  CONTRACT_VERSION,
  type SearchResponse,
} from "../packages/contracts/src/index";
import {
  providerObservation,
  sourceProperty,
  SOURCE_SNAPSHOT,
} from "./support/source-observations";
import { approvedModelResponse } from "./support/retrieval-model";
const base = {
  snapshotId: SOURCE_SNAPSHOT,
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
const prompt = "Show open roofing permits older than five years";
function activeData(date = "2026-10-28"): SearchResponse {
  const row = sourceProperty();
  const stamp = date + "T20:00:00.000Z";
  row.permits[0]!.kind = "other"; // Provider classification remains explicit; native facts are retained.
  row.permits[0]!.sourceObservations = [
    providerObservation({
      providerStatus: "IN_PROGRESS",
      supportedLifecycle: "open",
      statusBasis: "provider_reported_active",
      activityClaim: "provider_reported_active",
      currentlyReportedActiveIssuedMoreThanFiveYearsAgo: true,
      assessmentAt: stamp,
      sourceObservedAt: stamp,
      sourceDataThrough: date,
      sourceLastRefreshed: date,
      ageSinceIssueDays: date === "2026-10-28" ? 3652 : 3651,
    }),
  ];
  return {
    contractVersion: CONTRACT_VERSION,
    snapshotId: SOURCE_SNAPSHOT,
    queryHash: "synthetic-calendar-query",
    rows: [{ ...row, distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic only"],
  };
}
it("uses exact calendar anniversaries rather than multiplying year counts by365 or365.25", () => {
  expect(SOURCE_ASSESSMENT_DATE).toBe("2026-10-28");
  expect(calendarAgeThresholdDays(SOURCE_ASSESSMENT_DATE, 5)).toBe(1827);
  expect(calendarAgeThresholdDays("2024-02-29", 1)).toBe(367);
  expect(calendarAgeThresholdDays("2025-03-01", 1)).toBe(366);
  expect(calendarAgeThresholdDays("2024-02-29", 1, false)).toBe(366);
  expect(() => calendarAgeThresholdDays("2026-02-30", 5)).toThrow();
  expect(() => calendarAgeThresholdDays(SOURCE_ASSESSMENT_DATE, 200)).toThrow();
});
it("preserves the original activity-and-issue-age request separately from explicit continuous history", () => {
  const plan = interpretIntent(prompt, base);
  expect(plan.query).toMatchObject({
    permitStatus: "open",
    minOpenDays: 0,
    minPermitAgeSinceIssueDays: 1827,
  });
  expect(plan.ledger).toContainEqual(
    expect.objectContaining({
      material: true,
      classification: "applied",
      typedField: "sourceAssessmentDate",
      typedValue: SOURCE_ASSESSMENT_DATE,
    }),
  );
  const continuous = interpretIntent(
    "Show continuously open permits for more than five years",
    base,
  );
  expect(continuous.query).toMatchObject({
    permitStatus: "open",
    minOpenDays: 1827,
    permitActivityClaim: "native_reported_open",
  });
  expect(continuous.query?.minPermitAgeSinceIssueDays).toBeUndefined();
  const leap = interpretIntent("Show open permits older than one year", base, {
    sourceAssessmentDate: "2024-02-29",
  });
  expect(leap.query?.minPermitAgeSinceIssueDays).toBe(367);
  expect(
    interpretIntent(prompt, base, { sourceAssessmentDate: "invalid" }).accepted,
  ).toBe(false);
});
it("accepts a source-qualified provider-active roof candidate without inventing continuous native history", async () => {
  let reads = 0,
    calls = 0;
  const answer = await answerWithBedrock(
    {
      search: async () => {
        reads++;
        return activeData();
      },
      detail: async () => sourceProperty(),
    },
    {
      converse: async (request) => {
        calls++;
        return approvedModelResponse(request);
      },
    },
    prompt,
    base,
    { modelId: "synthetic" },
  );
  expect({ reads, calls }).toEqual({ reads: 2, calls: 1 });
  expect(answer.query.minOpenDays).toBe(0);
  expect(answer.results[0]?.permits[0]?.kind).toBe("other");
  expect(answer.answer).toContain("not continuous open duration");
  await expect(
    answerWithBedrock(
      {
        search: async () => activeData(),
        detail: async () => sourceProperty(),
      },
      {
        converse: async () => {
          throw new Error("Provider must not be called");
        },
      },
      "Show continuously open permits for more than five years",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow("source predicate");
});
for (const mismatchRead of [1, 2])
  it(`rejects source assessment-date mismatch on read${mismatchRead} and retains exact attempt/usage accounting`, async () => {
    let reads = 0,
      calls = 0,
      usage = 0;
    await expect(
      answerWithBedrock(
        {
          search: async () =>
            activeData(++reads === mismatchRead ? "2026-10-27" : "2026-10-28"),
          detail: async () => sourceProperty(),
        },
        {
          converse: async (request) => {
            calls++;
            return approvedModelResponse(request);
          },
        },
        prompt,
        base,
        {
          modelId: "synthetic",
          onUsage: async () => {
            usage++;
          },
        },
      ),
    ).rejects.toThrow("assessment date");
    expect({ reads, calls, usage }).toEqual({
      reads: mismatchRead,
      calls: mismatchRead - 1,
      usage: mismatchRead - 1,
    });
  });

it("a later caller clock does not move the pinned source calendar basis", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2040-06-01T00:00:00Z"));
    expect(
      interpretIntent(prompt, base).query?.minPermitAgeSinceIssueDays,
    ).toBe(1827);
  } finally {
    vi.useRealTimers();
  }
});

for (const [question, minimum] of [
  ["Show permits that have been open more than three years", 1097],
  ["Show permits that are open for more than three years", 1097],
  ["Show permits that have been open more than five days", 6],
  ["Show open roofing permits that have been open over three years", 1097],
  ["Show open permits for more than three years", 1097],
  ["Show continuously open permits for at least three years", 1096],
  ["Show permits that remain open for at least five days", 5],
  ["Show minimum open days five", 5],
  ["Show open for five days", 5],
] as const)
  it(`qualifies every accepted explicit duration through the same native/calendar rule: ${question}`, () => {
    const plan = interpretIntent(question, base);
    expect(plan.accepted).toBe(true);
    expect(plan.query).toMatchObject({
      minOpenDays: minimum,
      permitStatus: "open",
      permitActivityClaim: "native_reported_open",
    });
    expect(plan.ledger).toContainEqual(
      expect.objectContaining({
        typedField: "sourceAssessmentDate",
        typedValue: SOURCE_ASSESSMENT_DATE,
        material: true,
        classification: "applied",
      }),
    );
    expect(plan.query?.minPermitAgeSinceIssueDays).toBeUndefined();
  });
