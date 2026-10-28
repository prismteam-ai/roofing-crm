import { nonemptyEvidenceProperty } from "./support/evidence-fixture";
import { it, expect } from "vitest";
import type {
  ConverseCommandInput,
  ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { answerWithBedrock } from "../packages/agent/src/bedrock";
const query = {
  snapshotId: "synthetic-nova-protocol",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 1609.344,
  includeUnknown: true,
  limit: 5,
};
const data = {
  contractVersion: "0.3.0",
  snapshotId: query.snapshotId,
  queryHash: "synthetic-query-hash",
  rows: [{ ...nonemptyEvidenceProperty, distanceMeters: 0 }],
  total: 1,
  truncated: false,
  nextCursor: null,
  limitations: [
    "Synthetic nonempty evidence; source uncertainty remains explicit",
  ],
};
const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
const toolUse = {
  toolUseId: "synthetic-tool-use-id",
  name: "selectGroundedEvidence",
  input: { selections: [{ ordinal: 0, reason: "context_match" }] },
};
it("forces exactly one presentation tool with minimized retrieved facts and no raw record IDs", async () => {
  const requests: ConverseCommandInput[] = [];
  const result = await answerWithBedrock(
    {
      search: async () => data,
      detail: async () => {
        throw Error("No detail expected");
      },
    } as never,
    {
      converse: async (input) => {
        requests.push(structuredClone(input));
        return {
          output: { message: { role: "assistant", content: [{ toolUse }] } },
          stopReason: "tool_use",
          usage,
          metrics: { latencyMs: 1 },
          $metadata: {},
        } as ConverseCommandOutput;
      },
    },
    "Find roofing evidence",
    query,
    { modelId: "amazon.nova-micro-v1:0" },
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].toolConfig?.toolChoice).toEqual({ any: {} });
  expect(requests[0].toolConfig?.tools).toHaveLength(1);
  expect(requests[0].toolConfig?.tools?.[0].toolSpec?.name).toBe(
    "selectGroundedEvidence",
  );
  expect(result.mode).toBe("bedrock-grounded");
  expect(result.results).toEqual(data.rows);
  expect(JSON.stringify(requests)).not.toContain(nonemptyEvidenceProperty.id);
  expect(result.toolTrace).toHaveLength(1);
});
it("still rejects mixed thinking text plus a valid tool call after its one bounded evidence read", async () => {
  let reads = 0;
  await expect(
    answerWithBedrock(
      {
        search: async () => {
          reads++;
          return data;
        },
        detail: async () => {
          throw Error("No detail expected");
        },
      } as never,
      {
        converse: async () =>
          ({
            output: {
              message: {
                role: "assistant",
                content: [
                  { text: "synthetic private thinking must never pass" },
                  { toolUse },
                ],
              },
            },
            stopReason: "tool_use",
            usage,
            metrics: { latencyMs: 1 },
            $metadata: {},
          }) as ConverseCommandOutput,
      },
      "Find roofing evidence",
      query,
      { modelId: "amazon.nova-micro-v1:0" },
    ),
  ).rejects.toThrow("mixed unsupported text");
  expect(reads).toBe(1);
});
