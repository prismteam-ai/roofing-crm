import { afterEach, expect, it, vi } from "vitest";
import { setupFailureDiagnostic } from "../packages/hosted-runtime/src/setup-diagnostics";
import { createHostedHandler } from "../apps/api/src/lambda";
import { telemetry } from "../packages/hosted-runtime/src/observability";
afterEach(() => vi.restoreAllMocks());
const canary = "SYNTHETIC-PRIVATE-CANARY-DO-NOT-LOG";
it("emits only fixed stages and allowlisted own data fields", () => {
  const error = Object.assign(new Error(canary), {
    name: "AccessDeniedException",
    code: "ECONNRESET",
    $metadata: { httpStatusCode: 403, requestId: canary },
    cause: { secret: canary },
    headers: { authorization: canary },
    body: canary,
  });
  expect(setupFailureDiagnostic("access-secret", error)).toEqual({
    stage: "access-secret",
    errorName: "AccessDeniedException",
    networkCode: "ECONNRESET",
    httpStatus: 403,
  });
  expect(
    JSON.stringify(setupFailureDiagnostic("access-secret", error)),
  ).not.toContain(canary);
});
it("never reads getters, inherited metadata, messages, causes, headers or arbitrary names", () => {
  let reads = 0;
  const error = Object.create({
    name: "AccessDeniedException",
    code: "ECONNRESET",
    statusCode: 403,
  });
  for (const key of [
    "name",
    "code",
    "statusCode",
    "$metadata",
    "message",
    "cause",
    "headers",
    "body",
  ])
    Object.defineProperty(error, key, {
      get() {
        reads++;
        throw Error(canary);
      },
    });
  expect(setupFailureDiagnostic("runtime", error)).toEqual({
    stage: "runtime",
  });
  expect(reads).toBe(0);
  for (const value of [
    null,
    [],
    canary,
    403,
    { name: canary, code: canary, statusCode: "403" },
    { $metadata: Object.create({ httpStatusCode: 403 }) },
    new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw Error(canary);
        },
      },
    ),
  ])
    expect(setupFailureDiagnostic("runtime", value)).toEqual({
      stage: "runtime",
    });
});
for (const stage of ["runtime", "access-secret", "oracle-client"] as const) {
  it(`logs a fixed safe ${stage} failure while preserving the closed response`, async () => {
    const warn = vi
      .spyOn(telemetry.logger, "warn")
      .mockImplementation(() => {});
    const error = Object.assign(new Error(canary), {
      name: "ServiceUnavailableException",
      $metadata: { httpStatusCode: 503 },
      code: "ETIMEDOUT",
    });
    const runtime = {
      access: async () => {
        throw error;
      },
    } as never;
    const handler = createHostedHandler(
      () => {
        if (stage === "runtime") throw error;
        if (stage === "oracle-client")
          return { access: async () => ({}) } as never;
        return runtime;
      },
      () => {
        throw error;
      },
    );
    const result = await handler({ rawPath: "/api/health" });
    expect(result.statusCode).toBe(500);
    expect(warn).toHaveBeenCalledWith("hosted_setup_failed", {
      stage,
      errorName: "ServiceUnavailableException",
      networkCode: "ETIMEDOUT",
      httpStatus: 503,
    });
    expect(JSON.stringify([result, warn.mock.calls])).not.toContain(canary);
  });
}
