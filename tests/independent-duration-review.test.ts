import { it, expect } from "vitest";
import { interpretIntent } from "../packages/agent/src/intent";
import { answerWithBedrock } from "../packages/agent/src/bedrock";
import {
  CONTRACT_VERSION,
  type SearchResponse,
} from "../packages/contracts/src/index";
import { sourceProperty, SOURCE_SNAPSHOT } from "./support/source-observations";
import { approvedModelResponse } from "./support/retrieval-model";
const base = {
  snapshotId: SOURCE_SNAPSHOT,
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
it("all accepted continuous-duration word orders retain the same strict calendar and native-history constraints", () => {
  for (const prompt of [
    "Show permits that have been open more than three years",
    "Show permits open more than three years",
  ]) {
    const plan = interpretIntent(prompt, base);
    expect(plan.accepted).toBe(true);
    expect(plan.query).toMatchObject({
      minOpenDays: 1097,
      permitActivityClaim: "native_reported_open",
    });
    expect(
      plan.ledger.some(
        (e) =>
          e.typedField === "sourceAssessmentDate" &&
          e.typedValue === "2026-10-28",
      ),
    ).toBe(true);
  }
});
it("more than five days cannot admit an interval of exactly five days", () => {
  const plan = interpretIntent(
    "Show permits that have been open more than five days",
    base,
  );
  expect(plan.accepted).toBe(true);
  expect(plan.query?.minOpenDays).toBe(6);
});
it("does not call the model or render an exact-three-year municipal date as more than three years of native continuous history", async () => {
  const row = sourceProperty();
  row.permits[0] = {
    ...row.permits[0]!,
    status: "open",
    statusBasis: "explicit_open",
    openedAt: "2023-10-28",
    closedAt: null,
    statusObservedAt: "2026-10-28T20:00:00.000Z",
    sourceObservations: [],
  };
  const data: SearchResponse = {
    contractVersion: CONTRACT_VERSION,
    snapshotId: SOURCE_SNAPSHOT,
    queryHash: "independent-synthetic-boundary",
    rows: [{ ...row, distanceMeters: 0 }],
    total: 1,
    truncated: false,
    nextCursor: null,
    limitations: [
      "Independent synthetic boundary witness; no native continuous history.",
    ],
  };
  let calls = 0;
  await expect(
    answerWithBedrock(
      { search: async () => data, detail: async () => row },
      {
        converse: async (request) => {
          calls++;
          return approvedModelResponse(request);
        },
      },
      "Show permits that have been open more than three years",
      base,
      { modelId: "synthetic" },
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
