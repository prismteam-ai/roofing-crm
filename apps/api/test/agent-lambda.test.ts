import type { APIGatewayProxyEventV2, Context as LambdaContext } from "aws-lambda";
import { expect, test } from "vitest";
import { createAgentEndpoint } from "../src/agent.ts";
import { createAgentLambda } from "../src/agent-lambda.ts";
import { loadEnv } from "../src/env.ts";

const event = (method: string, body?: string): APIGatewayProxyEventV2 =>
  ({
    version: "2.0",
    rawPath: "/",
    body,
    isBase64Encoded: false,
    headers: {},
    requestContext: { http: { method, sourceIp: "9.9.9.9", path: "/" } },
  }) as unknown as APIGatewayProxyEventV2;
const ctx = { functionName: "agent" } as LambdaContext;

test("the Function URL handler passes the question and the caller's IP to the agent", async () => {
  const seen: unknown[] = [];
  const h = createAgentLambda(async (body, ip) => {
    seen.push(body, ip);
    return { status: 200, body: { text: "ok", usage: { totalTokens: 5 } } };
  });
  const r = await h(event("POST", JSON.stringify({ message: "hi" })), ctx);
  expect(r.statusCode).toBe(200);
  expect(JSON.parse(r.body!)).toMatchObject({ text: "ok" });
  expect(seen).toEqual([{ message: "hi" }, "9.9.9.9"]);
  expect((await h(event("POST", "{not json"), ctx)).statusCode).toBe(400);
  expect((await h(event("GET"), ctx)).statusCode).toBe(405);
});

test("without a Claude API key the agent answers 503 with an explanation", async () => {
  const env = loadEnv({
    ORACLE_API_URL: "http://o.test",
    ORACLE_MCP_URL: "http://o.test/mcp",
    ORACLE_MANIFEST_CID: "bafkreiaw4jf6xzwtgpcfadnu7vbwpwpshbv7qz2hflapksf5m4rzl4dsby",
  });
  const r = await (await createAgentEndpoint(env))({ message: "hi" }, "1.1.1.1");
  expect(r).toEqual({ status: 503, body: { error: expect.stringMatching(/not configured/) } });
});
