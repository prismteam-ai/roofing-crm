import { it, expect } from "vitest";
import {
  answerWithBedrock,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import { groundedFailureDetail } from "../packages/agent/src/failure-detail";
import {
  DomainError,
  CONTRACT_VERSION,
  PropertySchema,
} from "../packages/contracts/src/index";
const q = {
  snapshotId: "synthetic-repair",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
};
const p = PropertySchema.parse({
  id: "synthetic-repair-row",
  nativeId: "synthetic-repair-row",
  address: "Synthetic repair fixture",
  parcelIds: [],
  coordinates: { lat: q.lat, lng: q.lng },
  usage: "unknown",
  roof: {
    ageYears: null,
    basis: "unknown",
    confidence: "unknown",
    asOf: "2026-10-28",
    caveats: ["Synthetic"],
  },
  permits: [],
  ownership: {
    lastTransferDate: null,
    historyCoverage: "unknown",
    ownerRegion: "unknown",
  },
  provenance: [],
});
const provider = (
  input: unknown,
  inspect?: (text: string) => void,
): ConverseTransport => ({
  converse: async (request) => {
    inspect?.(request.system![0].text!);
    return {
      $metadata: {},
      metrics: { latencyMs: 1 },
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      stopReason: "tool_use",
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "synthetic-repair",
                name: "selectGroundedEvidence",
                input: input as never,
              },
            },
          ],
        },
      },
    };
  },
});
const reader = (empty = false) => ({
  search: async () => ({
    contractVersion: CONTRACT_VERSION,
    snapshotId: q.snapshotId,
    queryHash: "synthetic-repair-query",
    rows: empty ? [] : [{ ...p, distanceMeters: 0 }],
    total: empty ? 0 : 1,
    truncated: false,
    nextCursor: null,
    limitations: ["Synthetic"],
  }),
  detail: async () => p,
});
it("only repair-1 adds explicit empty/nonempty/zero-based/enum instructions; base prompt stays unchanged", async () => {
  let base = "",
    repair = "";
  await answerWithBedrock(
    reader(true),
    provider({ selections: [] }, (text) => (base = text)),
    "Find evidence",
    q,
    { modelId: "synthetic", promptRevision: "base" },
  );
  await answerWithBedrock(
    reader(true),
    provider({ selections: [] }, (text) => (repair = text)),
    "Find evidence",
    q,
    { modelId: "synthetic", promptRevision: "repair-1" },
  );
  expect(base).not.toContain("Repair1:");
  expect(repair.startsWith(base)).toBe(true);
  for (const literal of [
    '{"selections":[]}',
    "numeric zero-based integer",
    "sentinel",
    "exactly ordinal and reason",
    "context_match",
    "at least one item",
  ])
    expect(repair).toContain(literal);
  const valid = await answerWithBedrock(
    reader(),
    provider({ selections: [{ ordinal: 0, reason: "context_match" }] }),
    "Find evidence",
    q,
    { modelId: "synthetic", promptRevision: "repair-1" },
  );
  expect(valid.mode).toBe("bedrock-grounded");
  expect(valid.results).toHaveLength(1);
});
it("repair never weakens empty/nonempty/subset/unique/schema/rationale invariants and exposes only a fixed safe failure enum", async () => {
  for (const [input, empty, detail] of [
    [{ selections: [] }, false, "selection_ordinals"],
    [
      { selections: [{ ordinal: 0, reason: "context_match" }] },
      true,
      "selection_ordinals",
    ],
    [
      { selections: [{ ordinal: "0", reason: "context_match" }] },
      false,
      "selection_schema",
    ],
    [
      { selections: [{ ordinal: -1, reason: "context_match" }] },
      false,
      "selection_schema",
    ],
    [
      {
        selections: [
          { ordinal: 0, reason: "context_match" },
          { ordinal: 0, reason: "context_match" },
        ],
      },
      false,
      "selection_ordinals",
    ],
    [
      { selections: [{ ordinal: 0, reason: "observed_bbb_rating" }] },
      false,
      "selection_rationale",
    ],
    [
      {
        selections: [
          {
            ordinal: 0,
            reason: "context_match",
            text: "synthetic-private-provider-detail",
          },
        ],
      },
      false,
      "selection_schema",
    ],
  ] as const) {
    try {
      await answerWithBedrock(
        reader(empty),
        provider(input),
        "Find evidence",
        q,
        { modelId: "synthetic", promptRevision: "repair-1" },
      );
      throw Error("Invalid selection accepted");
    } catch (error) {
      expect(groundedFailureDetail(error)).toBe(detail);
    }
  }
  expect(
    groundedFailureDetail(
      new DomainError(
        "INVALID_INPUT",
        "Provider supplied invalid grounded selection arguments plus synthetic private text",
      ),
    ),
  ).toBeUndefined();
  expect(
    groundedFailureDetail(
      new Error("Provider supplied invalid grounded selection arguments"),
    ),
  ).toBeUndefined();
  expect(
    groundedFailureDetail(
      new DomainError("INVALID_INPUT", "Provider token usage was invalid"),
    ),
  ).toBe("usage_invalid");
  expect(
    groundedFailureDetail(
      new DomainError("INVALID_INPUT", "Provider token usage was inconsistent"),
    ),
  ).toBe("usage_inconsistent");
  expect(
    groundedFailureDetail(
      new DomainError(
        "COST_LIMIT_REACHED",
        "Provider exceeded the token budget",
      ),
    ),
  ).toBe("usage_budget");
});
