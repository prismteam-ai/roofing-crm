import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { Tracer } from "@aws-lambda-powertools/tracer";
import { describe, expect, it } from "vitest";
import type { ApiContext } from "../trpc.js";
import { appRouter, healthRouter } from "./health.js";

function createTestApiContext(): ApiContext {
  const serviceName = "roofing-crm-api-test";
  return {
    logger: new Logger({ serviceName }),
    tracer: new Tracer({ serviceName }),
    metrics: new Metrics({ serviceName, namespace: "RoofingCrmApiTest" }),
  };
}

describe("health.ping", () => {
  // Given a caller with Powertools context and no credentials in env for the procedure
  // When health.ping runs
  // Then the payload is { ok: true } with no credentials fields
  it("returns ok without credentials fields", async () => {
    const caller = appRouter.createCaller(createTestApiContext());

    const payload = await caller.health.ping();

    expect(payload).toEqual({ ok: true });
    expect(payload).not.toHaveProperty("credentials");
    expect(payload).not.toHaveProperty("credential");
    expect(Object.keys(payload)).toEqual(["ok"]);
  });

  // Given health.ping succeeds
  // When the payload is inspected as JSON
  // Then it contains no AWS access-key shaped secrets
  it("includes no AWS keys", async () => {
    const caller = appRouter.createCaller(createTestApiContext());

    const payload = await caller.health.ping();
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/AKIA[0-9A-Z]{16}/);
    expect(serialized).not.toMatch(/aws_access_key_id/i);
    expect(serialized).not.toMatch(/aws_secret_access_key/i);
    expect(serialized).not.toMatch(/secretAccessKey/i);
    expect(payload).not.toHaveProperty("accessKeyId");
    expect(payload).not.toHaveProperty("secretAccessKey");
  });
});

describe("appRouter", () => {
  // Given the root app router
  // When health is resolved on a caller
  // Then the health domain (and ping) is exposed
  it("exposes health", async () => {
    expect(healthRouter).toBeDefined();
    const caller = appRouter.createCaller(createTestApiContext());
    expect(typeof caller.health.ping).toBe("function");
    await expect(caller.health.ping()).resolves.toEqual({ ok: true });
  });
});
