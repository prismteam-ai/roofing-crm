import { it, expect } from "vitest";
import { P5_LIVE_CORPUS } from "../packages/agent/src/intent/live-corpus";
import { interpretIntent } from "../packages/agent/src/intent";
import { officialPlaceResolver } from "../packages/places/src/index";
import { createHash } from "node:crypto";
import { qualityFailure } from "../packages/agent/src/quality";
import { CAMPAIGN_PHASE } from "../packages/agent/src/campaign";
import { ROUTING_ARCHITECTURE } from "../packages/agent/src/bedrock";
it("freezes 24 accepted and 12 refused source-bound cases before any live call", () => {
  expect(P5_LIVE_CORPUS).toHaveLength(36);
  expect(P5_LIVE_CORPUS.filter((x) => x.expected === "accepted")).toHaveLength(
    24,
  );
  expect(new Set(P5_LIVE_CORPUS.map((x) => x.id)).size).toBe(36);
  for (const item of P5_LIVE_CORPUS) {
    const place = officialPlaceResolver.resolve(item.contextPlace);
    expect(place.status, item.contextPlace).toBe("resolved");
    if (place.status !== "resolved") throw Error("Missing context");
    const plan = interpretIntent(item.prompt, {
      snapshotId: "synthetic-live-corpus-plan",
      ...place.place.center,
      radiusMeters: 8046.72,
      limit: 50,
      ...item.base,
    });
    expect(plan.accepted, item.id).toBe(item.expected === "accepted");
  }
});
it("cannot promote partial, historical, source-empty or unmeasured failures into a model-repair allowance", () => {
  const measured = {
    architecture: ROUTING_ARCHITECTURE,
    modelId: "us.amazon.nova-micro-v1:0",
    region: "us-east-2",
    promptRevision: "base",
    converseCalls: 1,
    inputTokens: 100,
    unmeasuredCalls: 0,
    reservedMicroUsd: 560,
  };
  const report = {
    profile: "original-objective-36-retrieval-v3",
    phase: CAMPAIGN_PHASE,
    architecture: ROUTING_ARCHITECTURE,
    modelId: "us.amazon.nova-micro-v1:0",
    region: "us-east-2",
    revision: "base",
    accepted: false,
    completedAt: "2026-10-28T06:00:00Z",
    outcomes: P5_LIVE_CORPUS.map((p, i) => ({
      id: p.id,
      promptDigest: createHash("sha256").update(p.prompt).digest("hex"),
      passed: i !== 0,
      baselinePageRows: 1,
      checks: {
        sourceSubset: true,
        sameTypedQuery: true,
        appliedLedger: true,
        expectedModelPath: i !== 0,
      },
      modelAudit: measured,
    })),
  };
  expect(qualityFailure(report, "base")).toMatch(/^[a-f0-9]{64}$/);
  for (const invalid of [
    { ...report, phase: "prism-assessment-p4" },
    { ...report, architecture: "one-call-grounded-selection-v1" },
    {
      ...report,
      outcomes: report.outcomes.map((o) => ({
        ...o,
        modelAudit: {
          ...measured,
          architecture: "one-call-grounded-selection-v1",
        },
      })),
    },
    { ...report, outcomes: report.outcomes.slice(1) },
    {
      ...report,
      outcomes: report.outcomes.map((o) => ({ ...o, baselinePageRows: 0 })),
    },
    {
      ...report,
      outcomes: report.outcomes.map((o) => ({
        ...o,
        modelAudit: { ...measured, unmeasuredCalls: 1 },
      })),
    },
    {
      ...report,
      outcomes: report.outcomes.map((o) => ({
        ...o,
        checks: { ...o.checks, sourceSubset: false },
      })),
    },
  ])
    expect(() => qualityFailure(invalid, "base")).toThrow("measured failed");
});
