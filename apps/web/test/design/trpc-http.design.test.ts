/**
 * Design tests for tRPC HTTP failure diagnostics (status + API Gateway ids).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeTrpcHttpFailure, readTrpcHttpJsonBody } from "../../src/api/trpc-http";
import {
  SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY,
  resolveSearchInRadiusQueryErrorMessage,
} from "../../src/map/search-in-radius-query-status-copy";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeTrpcHttpFailure", () => {
  it("includes HTTP status, request id, and error type", () => {
    expect(
      describeTrpcHttpFailure({
        procedurePath: "search.inRadius",
        status: 503,
        requestId: "abc-123",
        errorType: "InternalServerErrorException",
      }),
    ).toBe(
      "search.inRadius failed with HTTP 503 errorType=InternalServerErrorException requestId=abc-123",
    );
  });
});

describe("readTrpcHttpJsonBody", () => {
  it("keeps HTTP 503 in the error when the body is empty", async () => {
    const response = new Response("", {
      status: 503,
      headers: { "apigw-requestid": "empty-body-id" },
    });

    await expect(readTrpcHttpJsonBody(response, "search.inRadius")).rejects.toThrow(
      /failed with HTTP 503.*requestId=empty-body-id/,
    );
  });

  it("keeps HTTP 503 in the error when the body is not JSON", async () => {
    const response = new Response("<html>Service Unavailable</html>", {
      status: 503,
      headers: {
        "apigw-requestid": "html-body-id",
        "x-amzn-errortype": "InternalServerErrorException",
      },
    });

    await expect(readTrpcHttpJsonBody(response, "search.inRadius")).rejects.toThrow(
      /failed with HTTP 503.*errorType=InternalServerErrorException.*requestId=html-body-id/,
    );
  });
});

describe("search.inRadius 503 diagnostics still map to operator copy", () => {
  it("maps request-id-enriched 503 to retry copy", () => {
    expect(
      resolveSearchInRadiusQueryErrorMessage(
        new Error(
          "search.inRadius failed with HTTP 503 errorType=InternalServerErrorException requestId=abc-123",
        ),
      ),
    ).toBe(SEARCH_IN_RADIUS_CANDIDATE_LIST_SEARCH_FAILED_COPY);
  });
});
