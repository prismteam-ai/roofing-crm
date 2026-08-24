import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiStackSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../cdk/lib/api-stack.ts",
);

describe("ApiStack CORS routes", () => {
  const source = readFileSync(apiStackSourcePath, "utf8");

  // Given this account has the minimum Lambda concurrency quota of 10
  // When the live alias is synthesized
  // Then it must not pin provisioned or reserved concurrency (Slowking demo
  // uses EventBridge MCP warmup + the unreserved pool so RagIndexer still fits)
  it("keeps the live alias within the account concurrency quota", () => {
    expect(source).not.toContain("provisionedConcurrentExecutions");
    expect(source).not.toContain("reservedConcurrentExecutions");
  });

  // Given HTTP API integration timeout is capped at ~29s and MCP cold start is 30–90s
  // When the stack is synthesized
  // Then EventBridge must keep queryProperties warm so evaluators are not 503'd
  it("schedules MCP warmup on the live alias", () => {
    expect(source).toContain("roofing-crm.mcp-warmup");
    expect(source).toContain("Duration.minutes(4)");
    expect(source).toContain("TrpcMcpWarmupRule");
  });

  // Given HTTP API corsPreflight owns browser OPTIONS
  // When Lambda integrations are declared
  // Then routes must not use ANY (ANY includes OPTIONS and tRPC returns 415)
  it("does not forward OPTIONS to Lambda via HttpMethod.ANY", () => {
    expect(source).not.toContain("HttpMethod.ANY");
  });

  // Given tRPC queries use GET and mutations use POST
  // When addRoutes wires /{proxy+} and /
  // Then those methods are listed and corsPreflight still allows OPTIONS
  it("lets corsPreflight own OPTIONS while Lambda serves GET and POST", () => {
    expect(source).toContain("corsPreflight:");
    expect(source).toContain("CorsHttpMethod.OPTIONS");
    expect(source).toContain('path: "/{proxy+}"');
    expect(source).toContain('path: "/"');
    expect(source).toContain("HttpMethod.GET");
    expect(source).toContain("HttpMethod.POST");
  });
});
