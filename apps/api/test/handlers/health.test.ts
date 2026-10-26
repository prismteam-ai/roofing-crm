// T006 (contracts/health.md): write first, confirm it fails (no handler/router exists yet),
// then T008 makes it pass. Exercises the tRPC router directly (createCaller), not the Lambda
// envelope — the envelope is proven by cdk-nag/Powertools wiring (TN02), not a unit test.
import { describe, expect, it } from "vitest";
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { handler, stripTrpcPrefix } from "../../src/handlers/health.js";
import { appRouter } from "../../src/routers/index.js";

describe("health.ping (contracts/health.md)", () => {
  it("returns { ok: true, timestamp } with no input and no auth", async () => {
    const caller = appRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.health.ping();
    expect(result.ok).toBe(true);
    expect(typeof result.timestamp).toBe("string");
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it("the output shape is exactly { ok, timestamp } — no extra fields", async () => {
    const caller = appRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.health.ping();
    expect(Object.keys(result).sort()).toEqual(["ok", "timestamp"]);
  });
});

describe("stripTrpcPrefix (found deploying: the exact, unauthorized health.ping route has no {proxy+} path param, so the tRPC Lambda adapter otherwise derives the procedure path from the full rawPath, '/trpc' prefix and all)", () => {
  const baseEvent = { rawPath: "" } as APIGatewayProxyEventV2;

  it("strips a leading /trpc from rawPath", () => {
    const event = { ...baseEvent, rawPath: "/trpc/health.ping" };
    expect(stripTrpcPrefix(event).rawPath).toBe("/health.ping");
  });

  it("leaves a path with no /trpc prefix untouched", () => {
    const event = { ...baseEvent, rawPath: "/health.ping" };
    expect(stripTrpcPrefix(event)).toBe(event);
  });
});

describe("handler (TD-5: the Lambda envelope itself, not just the router/stripTrpcPrefix beneath it)", () => {
  // A realistic API Gateway HTTP API v2.0 payload for the exact, unauthorized GET /trpc/health.ping
  // route (no {proxy+} pathParameters — matches what stripTrpcPrefix exists to handle).
  function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
    return {
      version: "2.0",
      routeKey: "GET /trpc/health.ping",
      rawPath: "/trpc/health.ping",
      rawQueryString: "",
      headers: { accept: "application/json" },
      requestContext: {
        accountId: "123456789012",
        apiId: "test-api",
        domainName: "test-api.execute-api.eu-north-1.amazonaws.com",
        domainPrefix: "test-api",
        http: {
          method: "GET",
          path: "/trpc/health.ping",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: "vitest",
        },
        requestId: "test-request-id",
        routeKey: "GET /trpc/health.ping",
        stage: "$default",
        time: "01/Jan/2026:00:00:00 +0000",
        timeEpoch: 1735689600000,
      },
      isBase64Encoded: false,
      ...overrides,
    } as APIGatewayProxyEventV2;
  }

  const context = { awsRequestId: "test-aws-request-id" } as Context;

  it("returns a successful health.ping response for the real Lambda event shape", async () => {
    const result = await handler(makeEvent(), context);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body ?? "{}") as { result?: { data?: { ok?: boolean } } };
    expect(body.result?.data?.ok).toBe(true);
  });

  it("still returns a well-formed (if error) response for an unroutable path, rather than throwing out of the handler", async () => {
    const result = await handler(
      makeEvent({
        rawPath: "/trpc/not-a-real-procedure",
        routeKey: "GET /trpc/not-a-real-procedure",
      }),
      context,
    );
    // The Lambda itself never throws — trpcHandler converts an unknown-procedure lookup into a
    // typed HTTP error response (this is what stripTrpcPrefix's route-matching problem looked
    // like before it was fixed — found deploying).
    expect(result.statusCode).toBeGreaterThanOrEqual(400);
  });
});
