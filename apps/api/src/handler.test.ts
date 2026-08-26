import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handler } from "./handler.js";

const handlerSourcePath = join(dirname(fileURLToPath(import.meta.url)), "handler.ts");

describe("Lambda handler", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Given the API package entrypoint
  // When the module loads
  // Then it exports an aws-lambda adapter handler function
  it("exports a function from the AWS Lambda tRPC adapter", () => {
    expect(typeof handler).toBe("function");
    const source = readFileSync(handlerSourcePath, "utf8");
    expect(source).toContain("@trpc/server/adapters/aws-lambda");
    expect(source).toContain("awsLambdaRequestHandler");
    expect(source).toContain("createLambdaAppRouter");
    expect(source).toContain("onError");
    expect(source).toContain("tRPC procedure failed");
    expect(source).toContain("isMcpWarmupEvent");
    expect(source).toContain("ELEPHANT_MCP_HTTP_QUERY_TIMEOUT_MS");
    expect(source).toContain("elephantMcpTimeoutStore.run");
    expect(source).toContain('process.env["AWS_LAMBDA_FUNCTION_NAME"]');
    expect(source).toContain('process.env["LEAD_RECORD_TABLE_NAME"]');
  });

  // Given the Lambda runtime marker is set without a leads table
  // When the handler module resolves the router
  // Then it fails loudly instead of serving stub routers
  it("requires LEAD_RECORD_TABLE_NAME when AWS_LAMBDA_FUNCTION_NAME is set", async () => {
    vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "roofing-crm-api-test");
    vi.stubEnv("LEAD_RECORD_TABLE_NAME", "");

    await expect(import("./handler.js")).rejects.toThrow(
      /LEAD_RECORD_TABLE_NAME is required/,
    );
  });
});
