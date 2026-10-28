import { it, expect } from "vitest";
import {
  bedrockTransport,
  retrievalArgumentsSchema,
  type ModelRequest,
} from "../packages/agent/src/provider";
import {
  REVIEW_REGION,
  MICRO_MODEL,
} from "../packages/runtime-config/src/index";

const request: ModelRequest = {
  modelId: MICRO_MODEL,
  system: "Synthetic test: exactly one approved retrieval tool.",
  prompt: "Synthetic bounded retrieval",
  approved: {
    template: "verified_property_search",
    queryDigest: "a".repeat(64),
    constraintDigest: "b".repeat(64),
    limit: 5,
    sort: "distance",
  },
  maxOutputTokens: 1000,
};
const credentials = async () => ({
  accessKeyId: "SYNTHETIC_FIXTURE_ACCESS",
  secretAccessKey: "synthetic-test-secret-never-an-actual-credential",
});

it("the actual Vercel AI SDK provider signs one Bedrock call with a strict Zod tool and preserves measured usage", async () => {
  const calls: Request[] = [];
  const provider = bedrockTransport(REVIEW_REGION, {
    credentialProvider: credentials,
    fetch: async (input, init) => {
      calls.push(new Request(input, init));
      return Response.json({
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "synthetic-sdk-tool",
                  name: "retrieveProperties",
                  input: request.approved,
                },
              },
            ],
          },
        },
        stopReason: "tool_use",
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        metrics: { latencyMs: 1 },
      });
    },
  });
  const result = await provider.converse(request, new AbortController().signal);
  expect(calls).toHaveLength(1);
  expect(new URL(calls[0].url).hostname).toBe(
    "bedrock-runtime.us-east-2.amazonaws.com",
  );
  const body = (await calls[0].json()) as {
    toolConfig: {
      toolChoice: unknown;
      tools: { toolSpec: { name: string; inputSchema: { json: unknown } } }[];
    };
    inferenceConfig: { maxTokens: number };
  };
  expect(body.toolConfig.toolChoice).toEqual({
    tool: { name: "retrieveProperties" },
  });
  expect(body.toolConfig.tools).toHaveLength(1);
  expect(body.toolConfig.tools[0].toolSpec.name).toBe("retrieveProperties");
  expect(body.inferenceConfig.maxTokens).toBe(1000);
  expect(result).toMatchObject({
    finishReason: "tool-calls",
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    content: [
      {
        type: "tool-call",
        toolName: "retrieveProperties",
        input: request.approved,
      },
    ],
  });
});

it("the actual AI SDK adapter never retries a failed request and passes its cancellation signal", async () => {
  let calls = 0;
  const provider = bedrockTransport(REVIEW_REGION, {
    credentialProvider: credentials,
    fetch: async (_input, init) => {
      calls++;
      expect(init?.signal).toBeDefined();
      return Response.json(
        { message: "synthetic service failure" },
        { status: 503 },
      );
    },
  });
  await expect(
    provider.converse(request, new AbortController().signal),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

it("the Zod tool rejects missing, modified and additional material parameters", () => {
  const schema = retrievalArgumentsSchema(request.approved);
  expect(schema.parse(request.approved)).toEqual(request.approved);
  for (const input of [
    { ...request.approved, queryDigest: "c".repeat(64) },
    { ...request.approved, limit: 1 },
    { ...request.approved, sort: "roof_age_desc" },
    { ...request.approved, sql: "synthetic rejected SQL" },
    {},
    undefined,
  ])
    expect(schema.safeParse(input).success).toBe(false);
});
