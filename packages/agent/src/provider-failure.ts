import { DomainError } from "../../contracts/src/index";
export const PROVIDER_FAILURE_KINDS = [
  "provider_timeout",
  "provider_access_denied",
  "provider_throttled",
  "provider_request_rejected",
  "provider_service_error",
  "provider_unknown_failure",
] as const;
export const SDK_ERROR_NAMES = [
  "AI_APICallError",
  "AI_RetryError",
  "AI_TypeValidationError",
  "AI_InvalidToolInputError",
  "AI_NoSuchToolError",
  "AI_NoObjectGeneratedError",
  "AbortError",
  "TimeoutError",
  "CredentialsProviderError",
  "TokenProviderError",
] as const;
export const AWS_ERROR_NAMES = [
  "AccessDeniedException",
  "ValidationException",
  "ResourceNotFoundException",
  "ThrottlingException",
  "ServiceUnavailableException",
  "InternalServerException",
  "ModelTimeoutException",
  "ModelNotReadyException",
  "ModelErrorException",
  "ExpiredTokenException",
  "UnrecognizedClientException",
  "InvalidSignatureException",
] as const;
export interface ProviderFailureDiagnostic {
  kind: (typeof PROVIDER_FAILURE_KINDS)[number];
  sdkErrorName?: (typeof SDK_ERROR_NAMES)[number];
  awsErrorName?: (typeof AWS_ERROR_NAMES)[number];
  httpStatus?: number;
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function own(value: unknown, key: string): unknown {
  try {
    const object = record(value);
    return Object.hasOwn(object, key) ? object[key] : undefined;
  } catch {
    return undefined;
  }
}
function listed<T extends string>(
  value: unknown,
  list: readonly T[],
): T | undefined {
  return typeof value === "string"
    ? list.find((item) => item === value)
    : undefined;
}
/** The only diagnostic data allowed into audit responses or structured logs. */
export function sanitizeProviderFailureDiagnostic(
  value: unknown,
): ProviderFailureDiagnostic | undefined {
  const kind = listed(own(value, "kind"), PROVIDER_FAILURE_KINDS);
  if (!kind) return undefined;
  const sdkErrorName = listed(own(value, "sdkErrorName"), SDK_ERROR_NAMES),
    awsErrorName = listed(own(value, "awsErrorName"), AWS_ERROR_NAMES),
    status = own(value, "httpStatus");
  return {
    kind,
    ...(sdkErrorName ? { sdkErrorName } : {}),
    ...(awsErrorName ? { awsErrorName } : {}),
    ...(typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? { httpStatus: status }
      : {}),
  };
}
const classification = {
  provider_timeout: {
    code: "QUERY_TIMEOUT",
    message: "Model provider request exceeded its bounded deadline",
  },
  provider_access_denied: {
    code: "NOT_AUTHORIZED",
    message: "Model provider authorization was rejected",
  },
  provider_throttled: {
    code: "RATE_LIMITED",
    message: "Model provider request was throttled",
  },
  provider_request_rejected: {
    code: "INVALID_INPUT",
    message: "Model provider rejected the bounded request",
  },
  provider_service_error: {
    code: "SNAPSHOT_UNAVAILABLE",
    message: "Model provider service could not complete the bounded request",
  },
  provider_unknown_failure: {
    code: "SNAPSHOT_UNAVAILABLE",
    message: "Model provider could not complete the bounded request",
  },
} as const;
export class ProviderFailure extends DomainError {
  readonly diagnostic: ProviderFailureDiagnostic;
  constructor(diagnostic: ProviderFailureDiagnostic) {
    const safe = sanitizeProviderFailureDiagnostic(diagnostic) ?? {
      kind: "provider_unknown_failure" as const,
    };
    super(classification[safe.kind].code, classification[safe.kind].message);
    this.name = "ProviderFailure";
    this.diagnostic = Object.freeze(safe);
  }
}
/** Inspect only allowlisted own name/status and one structured error-name header. Never read messages, bodies, request data or causes. */
export function classifyProviderFailure(
  error: unknown,
  aborted = false,
): ProviderFailure {
  const name =
    own(error, "name") ??
    (error instanceof DOMException ? error.name : undefined);
  const sdkErrorName = listed(name, SDK_ERROR_NAMES);
  let awsErrorName = listed(name, AWS_ERROR_NAMES);
  const status =
    own(error, "statusCode") ?? own(own(error, "$metadata"), "httpStatusCode");
  const httpStatus =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : undefined;
  const headers = own(error, "responseHeaders"),
    header =
      own(headers, "x-amzn-errortype") ?? own(headers, "X-Amzn-Errortype");
  if (typeof header === "string")
    awsErrorName ??= listed(header.split(":")[0], AWS_ERROR_NAMES);
  const kind: ProviderFailureDiagnostic["kind"] =
    aborted ||
    sdkErrorName === "AbortError" ||
    sdkErrorName === "TimeoutError" ||
    awsErrorName === "ModelTimeoutException" ||
    httpStatus === 408
      ? "provider_timeout"
      : httpStatus === 401 ||
          httpStatus === 403 ||
          [
            "AccessDeniedException",
            "ExpiredTokenException",
            "UnrecognizedClientException",
            "InvalidSignatureException",
          ].includes(awsErrorName ?? "") ||
          sdkErrorName === "CredentialsProviderError" ||
          sdkErrorName === "TokenProviderError"
        ? "provider_access_denied"
        : httpStatus === 429 ||
            ["ThrottlingException", "ModelNotReadyException"].includes(
              awsErrorName ?? "",
            )
          ? "provider_throttled"
          : [400, 404, 413, 415, 422].includes(httpStatus ?? 0) ||
              ["ValidationException", "ResourceNotFoundException"].includes(
                awsErrorName ?? "",
              )
            ? "provider_request_rejected"
            : (httpStatus ?? 0) >= 500 ||
                httpStatus === 424 ||
                [
                  "ServiceUnavailableException",
                  "InternalServerException",
                  "ModelErrorException",
                ].includes(awsErrorName ?? "")
              ? "provider_service_error"
              : "provider_unknown_failure";
  return new ProviderFailure({
    kind,
    ...(sdkErrorName ? { sdkErrorName } : {}),
    ...(awsErrorName ? { awsErrorName } : {}),
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}
export function providerFailureDiagnostic(
  error: unknown,
): ProviderFailureDiagnostic | undefined {
  return error instanceof ProviderFailure
    ? sanitizeProviderFailureDiagnostic(error.diagnostic)
    : undefined;
}
