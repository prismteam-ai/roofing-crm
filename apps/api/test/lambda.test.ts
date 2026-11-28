import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2, Context } from "aws-lambda";
import { expect, test } from "vitest";
import { createLambdaHandler } from "../src/lambda.ts";
import type { Deps } from "../src/context.ts";

const ctx = { functionName: "api", awsRequestId: "r" } as Context;

function event(rawPath: string, routeKey: string, proxy?: string): APIGatewayProxyEventV2 {
  return {
    version: "2.0",
    routeKey,
    rawPath,
    rawQueryString: "",
    headers: { host: "api.example.com" },
    pathParameters: proxy ? { proxy } : undefined,
    requestContext: {
      http: { method: "GET", path: rawPath, protocol: "HTTP/1.1", sourceIp: "1.2.3.4", userAgent: "t" },
      domainName: "api.example.com",
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

const deps = {
  oracle: {},
  leads: { ensureWorkspace: async () => {} },
  seed: async () => [],
} as unknown as Deps;

test("lambda: GET /health answers without touching the Oracle or DynamoDB", async () => {
  const h = createLambdaHandler(deps, { manifestCid: "bafkreitest", agentConfigured: true });
  const r = (await h(event("/health", "GET /health"), ctx)) as APIGatewayProxyStructuredResultV2;
  expect(r.statusCode).toBe(200);
  expect(JSON.parse(r.body as string)).toMatchObject({
    ok: true,
    manifestCid: "bafkreitest",
    agentConfigured: true,
  });
});

test("lambda: /trpc/{proxy+} routes to the procedure and issues the workspace cookie (Secure, SameSite=None)", async () => {
  const h = createLambdaHandler(deps);
  const r = (await h(event("/trpc/unknown.proc", "ANY /trpc/{proxy+}", "unknown.proc"), ctx)) as any;
  expect(r.statusCode).toBe(404); // routed to tRPC (NOT_FOUND procedure), not to /health
  const cookie = r.headers?.["set-cookie"] ?? r.cookies?.[0] ?? r.multiValueHeaders?.["set-cookie"]?.[0];
  expect(String(cookie)).toMatch(/crm_ws=.*HttpOnly; SameSite=None; Secure/);
});
