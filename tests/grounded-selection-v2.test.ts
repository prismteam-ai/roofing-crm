import { it, expect } from "vitest";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { ConverseCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import {
  answerWithBedrock,
  groundedSelectionJsonSchema,
  minimizedEvidenceRow,
  rationaleFromMinimizedFacts,
  ROUTING_ARCHITECTURE,
  type ConverseTransport,
} from "../packages/agent/src/bedrock";
import { assessAnswer } from "../packages/agent/src/quality";
import {
  CAMPAIGN_PHASE,
  QUALITY_GATE_KEY,
  DynamoCampaignStore,
  qualityAllows,
} from "../packages/agent/src/campaign";
import { MICRO_MODEL, LITE_MODEL } from "../packages/runtime-config/src/index";
import {
  CONTRACT_VERSION,
  type SearchResponse,
} from "../packages/contracts/src/index";
import { nonemptyEvidenceProperty } from "./support/evidence-fixture";

const q = {
  snapshotId: "synthetic-v2",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  limit: 3,
};
const prompt = "Find roofing evidence";
const data: SearchResponse = {
  contractVersion: CONTRACT_VERSION,
  snapshotId: q.snapshotId,
  queryHash: "synthetic-v2-query",
  rows: [0, 1, 2].map((i) => ({
    ...nonemptyEvidenceProperty,
    id: `V2-${i}`,
    nativeId: `V2-${i}`,
    distanceMeters: 0,
  })),
  total: 3,
  truncated: false,
  nextCursor: null,
  limitations: ["Synthetic protocol facts only"],
};
const response = (input: unknown): ConverseCommandOutput => ({
  $metadata: {},
  metrics: { latencyMs: 1 },
  stopReason: "tool_use",
  usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  output: {
    message: {
      role: "assistant",
      content: [
        {
          toolUse: {
            name: "selectGroundedEvidence",
            toolUseId: "synthetic-v2",
            input: input as never,
          },
        },
      ],
    },
  },
});
const run = async (input: unknown, inspect?: ConverseTransport["converse"]) => {
  let reads = 0,
    calls = 0,
    usage = 0;
  const result = await answerWithBedrock(
    {
      search: async () => {
        reads++;
        return data;
      },
      detail: async () => nonemptyEvidenceProperty,
    },
    {
      converse: async (request, signal) => {
        calls++;
        return inspect ? inspect(request, signal) : response(input);
      },
    },
    prompt,
    q,
    {
      modelId: MICRO_MODEL,
      onUsage: async () => {
        usage++;
      },
    },
  );
  return { result, reads, calls, usage };
};
it("v2 supplies an exact numeric enum/nonempty/unique bound and renders selected source rows with server-only reasons", async () => {
  const { result, reads, calls, usage } = await run(
    { ordinals: [0, 2] },
    async (request) => {
      const schema = request.toolConfig!.tools![0].toolSpec!.inputSchema!.json;
      expect(schema).toEqual({
        type: "object",
        properties: {
          ordinals: {
            type: "array",
            items: { type: "integer", enum: [0, 1, 2] },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
          },
        },
        required: ["ordinals"],
        additionalProperties: false,
      });
      const body = JSON.parse(request.messages![0].content![0].text!);
      expect(body.retrievedEvidence.rows).toHaveLength(3);
      expect(body.retrievedEvidence.rows[0].roof.ageYears).toBe(30);
      expect(JSON.stringify(request)).not.toContain(
        nonemptyEvidenceProperty.address,
      );
      return response({ ordinals: [0, 2] });
    },
  );
  expect({ reads, calls, usage }).toEqual({ reads: 1, calls: 1, usage: 1 });
  expect(result.results).toEqual([data.rows[0], data.rows[2]]);
  expect(result.toolTrace[0]).toMatchObject({
    selectedOrdinals: [0, 2],
    totalMatched: 3,
    presentationProtocol: ROUTING_ARCHITECTURE,
    rationaleSource: "server-minimized-facts",
    rationaleCategories: ["roof_age_evidence", "roof_age_evidence"],
  });
  expect(assessAnswer("synthetic", prompt, q, result, data).passed).toBe(true);
  for (const mutation of [
    {
      ...result,
      toolTrace: [
        {
          ...result.toolTrace[0],
          presentationProtocol: "one-call-grounded-selection-v1",
        },
      ],
    },
    {
      ...result,
      toolTrace: [
        {
          ...result.toolTrace[0],
          rationaleCategories: ["observed_bbb_rating", "roof_age_evidence"],
        },
      ],
    },
  ])
    expect(
      assessAnswer("synthetic", prompt, q, mutation as never, data).passed,
    ).toBe(false);
});

it.each([
  { ordinals: [] },
  { ordinals: [0, 0] },
  { ordinals: [3] },
  { ordinals: [-1] },
  { ordinals: [0.5] },
  { ordinals: ["0"] },
  { ordinals: [0], reason: "observed_bbb_rating" },
  { ordinals: [0], text: "untrusted facts" },
  { selections: [{ ordinal: 0, reason: "context_match" }] },
  { ordinals: [{ ordinal: 0 }] },
  { ordinals: [2, 0] },
])(
  "rejects malformed/legacy/extra/out-of-range/duplicate/reversed ordinal payload %#",
  async (input) => {
    await expect(run(input)).rejects.toThrow();
  },
);
it("even an otherwise valid tool cannot add free text, extra tools or unexpected envelope fields", async () => {
  for (const invalid of [
    {
      ...response({ ordinals: [0] }),
      output: {
        message: {
          role: "assistant",
          content: [
            { text: "invented explanation" },
            ...response({ ordinals: [0] }).output!.message!.content!,
          ],
        },
      },
    },
    {
      ...response({ ordinals: [0] }),
      output: {
        message: {
          role: "assistant",
          content: [
            ...response({ ordinals: [0] }).output!.message!.content!,
            ...response({ ordinals: [0] }).output!.message!.content!,
          ],
        },
      },
    },
    {
      ...response({ ordinals: [0] }),
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                name: "selectGroundedEvidence",
                toolUseId: "synthetic",
                input: { ordinals: [0] },
                reason: "invented",
              },
            },
          ],
        },
      },
    },
  ])
    await expect(
      run(undefined, async () => invalid as ConverseCommandOutput),
    ).rejects.toThrow();
});
it("schema cannot advertise unprojected/sentinel ordinals or an empty model context", () => {
  expect(
    groundedSelectionJsonSchema([0]).properties.ordinals.items.enum,
  ).toEqual([0]);
  for (const bad of [
    [],
    [-1],
    [1],
    [0, 2],
    Array.from({ length: 51 }, (_, i) => i),
  ])
    expect(() => groundedSelectionJsonSchema(bad)).toThrow();
});
it("server explanations derive only observed basis, with context match for a closed-only otherwise unknown row", () => {
  const f = minimizedEvidenceRow(data.rows[0], 0);
  expect(rationaleFromMinimizedFacts(f, q)).toBe("roof_age_evidence");
  const closed = {
    ...f,
    roof: { ...f.roof, ageYears: null },
    permits: { ...f.permits, acquired: 1, closed: 1, unknown: 0 },
  };
  expect(rationaleFromMinimizedFacts(closed, q)).toBe("context_match");
  expect(
    rationaleFromMinimizedFacts(
      { ...closed, permits: { ...closed.permits, unknown: 1 } },
      q,
    ),
  ).toBe("unknown_evidence");
  expect(
    rationaleFromMinimizedFacts(
      {
        ...closed,
        permits: { ...closed.permits, open: 1, oldestOpenDays: 2000 },
      },
      q,
    ),
  ).toBe("observed_open_permit");
  const license = {
    identifier: "SYNTHETIC",
    type: "synthetic",
    status: "Issued",
    observedAt: "2026-10-28",
    matchConfidence: "medium" as const,
  };
  expect(
    rationaleFromMinimizedFacts({ ...closed, license: [license] }, q),
  ).toBe("reported_business_license");
  const bbb = {
    value: "A",
    scale: "BBB" as const,
    observedAt: "2026-10-28",
    matchConfidence: "high" as const,
  };
  expect(rationaleFromMinimizedFacts({ ...closed, bbb: [bbb] }, q)).toBe(
    "observed_bbb_rating",
  );
});
it("no missing/v1 gate can authorize v2 repair or Lite, and Dynamo accepts only its exact versioned key", async () => {
  const gate = {
    baseFailureSha256: "a".repeat(64),
    repairFailureSha256: "b".repeat(64),
    repairAttempts: 1 as const,
    measuredAt: "2026-10-28T00:00:00Z",
  };
  for (const old of [
    undefined,
    gate,
    { ...gate, architecture: "one-call-grounded-selection-v1" },
  ]) {
    expect(() =>
      qualityAllows(old as never, MICRO_MODEL, "base"),
    ).not.toThrow();
    expect(() =>
      qualityAllows(old as never, MICRO_MODEL, "repair-1"),
    ).toThrow();
    expect(() => qualityAllows(old as never, LITE_MODEL, "base")).toThrow();
  }
  const pk = `campaign#${CAMPAIGN_PHASE}`;
  for (const sk of [
    "quality-gate",
    "quality-gate#one-call-grounded-selection-v1",
    QUALITY_GATE_KEY,
  ]) {
    const seen: unknown[] = [];
    const store = new DynamoCampaignStore(
      {
        send: async (command: GetCommand) => {
          seen.push(command.input.Key);
          return { Item: { ...gate, pk, sk } };
        },
      } as never,
      "synthetic",
    );
    if (sk === QUALITY_GATE_KEY)
      await expect(
        store.authorize(MICRO_MODEL, "repair-1"),
      ).resolves.toBeUndefined();
    else
      await expect(store.authorize(MICRO_MODEL, "repair-1")).rejects.toThrow();
    expect(seen).toEqual([{ pk, sk: QUALITY_GATE_KEY }]);
  }
});
