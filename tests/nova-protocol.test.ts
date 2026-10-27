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
  contractVersion: "0.2.1",
  snapshotId: query.snapshotId,
  queryHash: "synthetic-query-hash",
  rows: [],
  total: 0,
  truncated: false,
  nextCursor: null,
  limitations: ["Synthetic empty evidence; unknown remains unknown"],
};
const usage = { inputTokens: 100, outputTokens: 20, totalTokens: 120 };
const toolUse = {
  toolUseId: "synthetic-tool-use-id",
  name: "searchRoofingEvidence",
  input: query,
};
it("forces the sole read tool first, then retains its exact definition and matched result under auto choice", async () => {
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
        return requests.length === 1
          ? ({
              output: {
                message: { role: "assistant", content: [{ toolUse }] },
              },
              stopReason: "tool_use",
              usage,
              metrics: { latencyMs: 1 },
              $metadata: {},
            } as ConverseCommandOutput)
          : ({
              output: {
                message: {
                  role: "assistant",
                  content: [{ text: JSON.stringify({ propertyIds: [] }) }],
                },
              },
              stopReason: "end_turn",
              usage,
              metrics: { latencyMs: 1 },
              $metadata: {},
            } as ConverseCommandOutput);
      },
    },
    "Find roofing evidence",
    query,
    { modelId: "amazon.nova-micro-v1:0" },
  );
  expect(requests).toHaveLength(2);
  expect(requests[0].toolConfig?.toolChoice).toEqual({ any: {} });
  expect(requests[0].toolConfig?.tools).toHaveLength(1);
  expect(requests[0].toolConfig?.tools?.[0].toolSpec?.name).toBe(
    "searchRoofingEvidence",
  );
  expect(requests[1].toolConfig?.tools).toEqual(requests[0].toolConfig?.tools);
  expect(requests[1].toolConfig?.toolChoice).toEqual({ auto: {} });
  expect(requests[1].messages?.[1].content?.[0].toolUse?.toolUseId).toBe(
    toolUse.toolUseId,
  );
  expect(requests[1].messages?.[2].content?.[0].toolResult?.toolUseId).toBe(
    toolUse.toolUseId,
  );
  expect(result.mode).toBe("bedrock-converse");
  expect(result.results).toEqual([]);
  expect(result.toolTrace).toHaveLength(1);
});
it("still rejects mixed thinking text plus a valid tool call before reading evidence", async () => {
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
  expect(reads).toBe(0);
});
