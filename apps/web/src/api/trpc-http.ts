/**
 * tRPC HTTP JSON helpers for SPA clients (leads + search).
 */

/**
 * tRPC HTTP mutation/query result envelope (data.json or error).
 */
interface TrpcDataEnvelope<T> {
  result?: { data?: T | { json?: T } };
  error?: { message?: string; json?: { message?: string } };
}

/**
 * Builds an operator-facing tRPC HTTP failure string.
 *
 * Keeps `failed with HTTP <status>` so roof-search copy can map 5xx, and
 * appends API Gateway ids so CloudWatch can be correlated from the browser.
 */
export function describeTrpcHttpFailure(arguments_: {
  procedurePath: string;
  status: number;
  requestId: string | null;
  errorType: string | null;
  errorMessage?: string;
}): string {
  const parts = [
    `${arguments_.procedurePath} failed with HTTP ${String(arguments_.status)}`,
  ];
  if (arguments_.errorType !== null && arguments_.errorType.length > 0) {
    parts.push(`errorType=${arguments_.errorType}`);
  }
  if (arguments_.requestId !== null && arguments_.requestId.length > 0) {
    parts.push(`requestId=${arguments_.requestId}`);
  }
  if (arguments_.errorMessage !== undefined && arguments_.errorMessage.length > 0) {
    parts.push(arguments_.errorMessage);
  }
  return parts.join(" ");
}

/**
 * Reads API Gateway / Lambda request id headers from a fetch Response.
 */
export function readApiGatewayRequestId(response: Response): string | null {
  return (
    response.headers.get("apigw-requestid") ??
    response.headers.get("x-amzn-requestid") ??
    response.headers.get("x-amzn-request-id")
  );
}

/**
 * Reads a tRPC HTTP JSON body, throwing when the HTTP status is not OK.
 */
export async function readTrpcHttpJsonBody(
  response: Response,
  procedurePath: string,
): Promise<unknown> {
  const rawText = await response.text();
  let body: unknown;
  try {
    body = rawText.length === 0 ? {} : JSON.parse(rawText);
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const envelope = (body ?? {}) as TrpcDataEnvelope<unknown>;
    const errorMessage = envelope.error?.message ?? envelope.error?.json?.message;
    const diagnostic = describeTrpcHttpFailure({
      procedurePath,
      status: response.status,
      requestId: readApiGatewayRequestId(response),
      errorType: response.headers.get("x-amzn-errortype"),
      errorMessage,
    });
    console.error(diagnostic, { bodyPreview: rawText.slice(0, 500) });
    throw new Error(diagnostic);
  }

  if (body === undefined) {
    throw new Error(`${procedurePath} returned non-JSON`);
  }
  return body;
}

/**
 * Parses a tRPC HTTP JSON response into the procedure output.
 */
export function parseTrpcDataEnvelope<T>(body: unknown, procedurePath: string): T {
  const envelope = body as TrpcDataEnvelope<T>;
  const errorMessage = envelope.error?.message ?? envelope.error?.json?.message;
  if (errorMessage !== undefined) {
    throw new Error(`${procedurePath} failed: ${errorMessage}`);
  }
  const data = envelope.result?.data;
  if (data !== undefined && data !== null && typeof data === "object") {
    const maybeJson = (data as { json?: T }).json;
    if (maybeJson !== undefined) {
      return maybeJson;
    }
  }
  if (data === undefined) {
    throw new Error(`${procedurePath} returned an empty tRPC envelope`);
  }
  return data as T;
}

/**
 * GET a tRPC query procedure over HTTP JSON.
 */
export async function fetchTrpcQuery<T>(
  apiBaseUrl: string,
  procedurePath: string,
  input?: unknown,
): Promise<T> {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const inputQuery =
    input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetch(`${baseUrl}/${procedurePath}${inputQuery}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const body: unknown = await readTrpcHttpJsonBody(response, procedurePath);
  return parseTrpcDataEnvelope<T>(body, procedurePath);
}

/**
 * POST a tRPC mutation procedure over HTTP JSON.
 */
export async function fetchTrpcMutation<T>(
  apiBaseUrl: string,
  procedurePath: string,
  input: unknown,
): Promise<T> {
  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/${procedurePath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body: unknown = await readTrpcHttpJsonBody(response, procedurePath);
  return parseTrpcDataEnvelope<T>(body, procedurePath);
}
