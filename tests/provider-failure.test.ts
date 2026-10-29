import { expect, it, vi, afterEach } from "vitest";
import {
  classifyProviderFailure,
  providerFailureDiagnostic,
  sanitizeProviderFailureDiagnostic,
} from "../packages/agent/src/provider-failure";
import { RuntimeTelemetry } from "../packages/hosted-runtime/src/observability";
afterEach(() => vi.restoreAllMocks());
const secret = "synthetic-private-owner-prompt-cookie-credential-canary";
it("classifies fast SDK validation rejection with only allowlisted metadata and never relabels it a timeout", () => {
  const error = Object.assign(
    new Error(secret + " $schema additionalProperties"),
    {
      name: "AI_APICallError",
      statusCode: 400,
      responseHeaders: { "x-amzn-errortype": "ValidationException" },
      responseBody: JSON.stringify({
        message: secret + " additionalProperties",
        __type: "ValidationException",
      }),
      requestBodyValues: { prompt: secret },
      url: secret,
    },
  );
  const safe = classifyProviderFailure(error);
  expect(safe.code).toBe("INVALID_INPUT");
  expect(safe.message).toBe("Model provider rejected the bounded request");
  expect(providerFailureDiagnostic(safe)).toEqual({
    kind: "provider_request_rejected",
    sdkErrorName: "AI_APICallError",
    awsErrorName: "ValidationException",
    httpStatus: 400,
  });
  expect(JSON.stringify(safe) + String(safe)).not.toContain(secret);
});
it("separates timeout, auth, throttle, service and unknown transport failures without changing provider counts", () => {
  for (const [input, aborted, kind, code] of [
    [
      Object.assign(new Error(secret), { name: "AbortError" }),
      false,
      "provider_timeout",
      "QUERY_TIMEOUT",
    ],
    [
      Object.assign(new Error(secret), {
        name: "AI_APICallError",
        statusCode: 403,
      }),
      false,
      "provider_access_denied",
      "NOT_AUTHORIZED",
    ],
    [
      Object.assign(new Error(secret), { name: "ThrottlingException" }),
      false,
      "provider_throttled",
      "RATE_LIMITED",
    ],
    [
      Object.assign(new Error(secret), {
        name: "AI_APICallError",
        statusCode: 503,
      }),
      false,
      "provider_service_error",
      "SNAPSHOT_UNAVAILABLE",
    ],
    [
      new Error(secret),
      false,
      "provider_unknown_failure",
      "SNAPSHOT_UNAVAILABLE",
    ],
    [new Error(secret), true, "provider_timeout", "QUERY_TIMEOUT"],
  ] as const) {
    const safe = classifyProviderFailure(input, aborted);
    expect(safe.code).toBe(code);
    expect(safe.diagnostic.kind).toBe(kind);
    expect(JSON.stringify(safe)).not.toContain(secret);
  }
});
it("drops unknown names, out-of-range status, request IDs and arbitrary metadata and bounds cause inspection", () => {
  const error = {
    name: secret,
    statusCode: 987654,
    responseHeaders: { "x-amzn-errortype": secret },
    responseBody: JSON.stringify({ message: secret }),
    requestBodyValues: { prompt: secret },
    cause: null as unknown,
  };
  error.cause = error;
  const safe = classifyProviderFailure(error);
  expect(safe.diagnostic).toEqual({
    kind: "provider_unknown_failure",
  });
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(
    sanitizeProviderFailureDiagnostic({
      kind: "provider_request_rejected",
      sdkErrorName: secret,
      awsErrorName: secret,
      httpStatus: 400,
      schemaKeysMentioned: ["strict", secret, "strict"],
      body: secret,
    }),
  ).toEqual({
    kind: "provider_request_rejected",
    httpStatus: 400,
  });
  expect(sanitizeProviderFailureDiagnostic({ kind: secret })).toBeUndefined();
});
it("logs only static sanitized diagnostic fields while keeping response bodies and trace/error objects private", async () => {
  const t = new RuntimeTelemetry("provider-diagnostic-fixture");
  const log = vi.spyOn(t.logger, "info").mockImplementation(() => undefined);
  vi.spyOn(t.metrics, "publishStoredMetrics").mockImplementation(
    () => t.metrics,
  );
  vi.spyOn(t.metrics, "captureColdStartMetric").mockImplementation(
    () => undefined,
  );
  await t.observe("agent", async () => ({
    statusCode: 200,
    body: JSON.stringify({
      mode: "deterministic-fallback",
      rows: [{ owner: secret }],
      modelAudit: {
        converseCalls: 1,
        providerFailure: {
          kind: "provider_request_rejected",
          sdkErrorName: "AI_APICallError",
          awsErrorName: "ValidationException",
          httpStatus: 400,
          schemaKeysMentioned: ["$schema", secret],
          message: secret,
          body: secret,
        },
      },
    }),
  }));
  expect(
    log.mock.calls.some(([message]) => message === "model_provider_failed"),
  ).toBe(true);
  expect(
    JSON.stringify(log.mock.calls) +
      JSON.stringify(t.metrics.serializeMetrics()),
  ).not.toContain(secret);
  const diagnostic = log.mock.calls.find(
    ([message]) => message === "model_provider_failed",
  )?.[1];
  expect(diagnostic).toEqual({
    kind: "provider_request_rejected",
    sdkErrorName: "AI_APICallError",
    awsErrorName: "ValidationException",
    httpStatus: 400,
  });
});

it("never reads provider messages, bodies, request data or causes while classifying a structured rejection", () => {
  let reads = 0;
  const error: Record<string, unknown> = {
    name: "AI_APICallError",
    statusCode: 400,
    responseHeaders: { "x-amzn-errortype": "ValidationException" },
  };
  for (const field of [
    "message",
    "responseBody",
    "requestBodyValues",
    "data",
    "cause",
    "lastError",
  ])
    Object.defineProperty(error, field, {
      get() {
        reads++;
        throw Error(secret);
      },
    });
  const safe = classifyProviderFailure(error);
  expect(reads).toBe(0);
  expect(safe.diagnostic).toEqual({
    kind: "provider_request_rejected",
    sdkErrorName: "AI_APICallError",
    awsErrorName: "ValidationException",
    httpStatus: 400,
  });
  expect(JSON.stringify(safe)).not.toContain(secret);
});
