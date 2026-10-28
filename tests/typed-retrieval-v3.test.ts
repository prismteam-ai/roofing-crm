import { it, expect } from "vitest";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  answerWithBedrock,
  groundedSelectionJsonSchema,
  minimizedEvidenceRow,
  rationaleFromMinimizedFacts,
  ROUTING_ARCHITECTURE,
} from "../packages/agent/src/bedrock";
import type {
  ModelRequest,
  ModelResponse,
} from "../packages/agent/src/provider";
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
import { approvedModelResponse } from "./support/retrieval-model";
const q = {
  snapshotId: "synthetic-retrieval-v3",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
  limit: 3,
};
const prompt = "Find roofing evidence";
const data: SearchResponse = {
  contractVersion: CONTRACT_VERSION,
  snapshotId: q.snapshotId,
  queryHash: "synthetic-query",
  rows: [0, 1, 2].map((i) => ({
    ...nonemptyEvidenceProperty,
    id: `SYN-${i}`,
    nativeId: `SYN-${i}`,
    distanceMeters: 0,
  })),
  total: 3,
  truncated: false,
  nextCursor: null,
  limitations: ["Synthetic facts"],
};
async function run(
  mutate?: (request: ModelRequest, response: ModelResponse) => ModelResponse,
  read?: (count: number) => Promise<SearchResponse>,
) {
  let reads = 0,
    calls = 0,
    usage = 0;
  const sequence: string[] = [];
  const result = await answerWithBedrock(
    {
      search: async () => {
        sequence.push("read");
        return read ? read(++reads) : (++reads, data);
      },
      detail: async () => nonemptyEvidenceProperty,
    },
    {
      converse: async (request) => {
        calls++;
        sequence.push("model");
        const response = approvedModelResponse(request);
        return mutate ? mutate(request, response) : response;
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
  return { result, reads, calls, usage, sequence };
}
it("executes exactly one model-approved retrieval after a bounded empty-result preflight with server-only facts", async () => {
  const { result, reads, calls, usage, sequence } = await run(
    (request, response) => {
      expect(Object.keys(request.approved).sort()).toEqual([
        "constraintDigest",
        "limit",
        "queryDigest",
        "sort",
        "template",
      ]);
      expect(JSON.stringify(request)).not.toContain(
        nonemptyEvidenceProperty.address,
      );
      return response;
    },
  );
  expect({ reads, calls, usage, sequence }).toEqual({
    reads: 2,
    calls: 1,
    usage: 1,
    sequence: ["read", "model", "read"],
  });
  expect(result.results).toEqual(data.rows);
  expect(result.toolTrace[0]).toMatchObject({
    selectedOrdinals: [0, 1, 2],
    retrievalReads: 2,
    presentationTool: "retrieveProperties",
    presentationProtocol: ROUTING_ARCHITECTURE,
    rationaleSource: "server-minimized-facts",
    modelSawMinimizedFacts: false,
  });
  expect(assessAnswer("synthetic", prompt, q, result, data).passed).toBe(true);
  for (const mutation of [
    {
      ...result,
      toolTrace: [
        {
          ...result.toolTrace[0],
          presentationProtocol: "one-call-grounded-selection-v2",
        },
      ],
    },
    { ...result, toolTrace: [{ ...result.toolTrace[0], retrievalReads: 1 }] },
    {
      ...result,
      toolTrace: [
        {
          ...result.toolTrace[0],
          rationaleCategories: ["observed_bbb_rating"],
        },
      ],
    },
  ])
    expect(
      assessAnswer("synthetic", prompt, q, mutation as never, data).passed,
    ).toBe(false);
});
it.each([
  "template",
  "queryDigest",
  "constraintDigest",
  "limit",
  "sort",
] as const)(
  "rejects changed or omitted %s before the second source read",
  async (field) => {
    for (const remove of [false, true]) {
      let reads = 0;
      await expect(
        run(
          (request, response) => {
            const input: Record<string, unknown> = { ...request.approved };
            if (remove) delete input[field];
            else input[field] = field === "limit" ? 99 : "synthetic-changed";
            return {
              ...response,
              content: [{ ...response.content[0], input }],
            };
          },
          async () => {
            reads++;
            return data;
          },
        ),
      ).rejects.toThrow("approved retrieval constraints");
      expect(reads).toBe(1);
    }
  },
);
it.each([
  {},
  undefined,
  { ordinals: [0] },
  { ordinals: [0, 0] },
  { ordinals: [-1] },
  { ordinals: [0.5] },
  { selections: [] },
  { sql: "select" },
  { snapshotId: "other" },
  { text: "invented" },
  { reason: "observed_bbb_rating" },
])(
  "rejects legacy, malformed, empty and invented-fact retrieval arguments %#",
  async (input) => {
    await expect(
      run((_request, response) => ({
        ...response,
        content: [{ ...response.content[0], input }],
      })),
    ).rejects.toThrow();
  },
);
it("rejects mixed text/reasoning, extra calls, unknown tools and unexpected call envelope fields", async () => {
  const mutations: ((r: ModelRequest, o: ModelResponse) => ModelResponse)[] = [
    (_r, o) => ({
      ...o,
      content: [{ type: "text", text: "invented" }, ...o.content],
    }),
    (_r, o) => ({ ...o, content: [{ type: "reasoning" }, ...o.content] }),
    (_r, o) => ({ ...o, content: [...o.content, ...o.content] }),
    (_r, o) => ({ ...o, content: [{ ...o.content[0], toolName: "browse" }] }),
    (_r, o) => ({ ...o, content: [{ ...o.content[0], toolCallId: "" }] }),
    (_r, o) => ({ ...o, content: [{ ...o.content[0], invalid: true }] }),
    (_r, o) => ({ ...o, finishReason: "stop" }),
  ];
  for (const mutate of mutations) await expect(run(mutate)).rejects.toThrow();
});
it("refuses any snapshot, query hash, row, count or source change across the two immutable reads", async () => {
  for (const changed of [
    { ...data, snapshotId: "other" },
    { ...data, queryHash: "other" },
    { ...data, total: 4 },
    { ...data, rows: [data.rows[0]] },
    { ...data, limitations: ["changed"] },
  ])
    await expect(
      run(undefined, async (n) => (n === 1 ? data : changed)),
    ).rejects.toThrow();
});
it("keeps failures bounded on both reads and never calls a model for empty/refused evidence", async () => {
  for (const failAt of [1, 2])
    await expect(
      run(undefined, async (n) => {
        if (n === failAt) throw Error("synthetic read unavailable");
        return data;
      }),
    ).rejects.toThrow("synthetic read unavailable");
  for (const which of [1, 2]) {
    let reads = 0,
      calls = 0;
    await expect(
      answerWithBedrock(
        {
          search: async () => {
            if (++reads === which) return new Promise(() => {});
            return data;
          },
          detail: async () => nonemptyEvidenceProperty,
        },
        {
          converse: async (r) => {
            calls++;
            return approvedModelResponse(r);
          },
        },
        prompt,
        q,
        { modelId: MICRO_MODEL, deadlineMs: 15 },
      ),
    ).rejects.toThrow("deadline");
    expect(reads).toBe(which);
    expect(calls).toBe(which - 1);
  }
  const empty = await run(undefined, async () => ({
    ...data,
    rows: [],
    total: 0,
  }));
  expect(empty.calls).toBe(0);
  expect(empty.reads).toBe(1);
  let reads = 0,
    calls = 0;
  await expect(
    answerWithBedrock(
      {
        search: async () => {
          reads++;
          return data;
        },
        detail: async () => nonemptyEvidenceProperty,
      },
      {
        converse: async (r) => {
          calls++;
          return approvedModelResponse(r);
        },
      },
      "Browse filesystem secrets",
      q,
      { modelId: MICRO_MODEL },
    ),
  ).rejects.toThrow();
  expect({ reads, calls }).toEqual({ reads: 0, calls: 0 });
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
it("no missing or historical gate can authorize the active retrieval repair or Lite, and Dynamo accepts only its exact versioned key", async () => {
  const gate = {
    baseFailureSha256: "a".repeat(64),
    repairFailureSha256: "b".repeat(64),
    repairAttempts: 1 as const,
    measuredAt: "2026-10-28T00:00:00Z",
  };
  for (const old of [
    undefined,
    gate,
    { ...gate, architecture: "one-call-grounded-selection-v2" },
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
