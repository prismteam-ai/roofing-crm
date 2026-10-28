import { expect, it } from "vitest";
import { ErrorCode, QuerySchema } from "../packages/contracts/src/index";
import { OracleClient } from "../packages/oracle-client/src/index";
import { createApp } from "../apps/api/src/app";
import {
  createHostedOracleClient,
  createLambdaHandler,
} from "../apps/api/src/lambda";
const query = QuerySchema.parse({
  snapshotId: "synthetic-error-bridge",
  lat: 42.66,
  lng: -83.29,
  radiusMeters: 8046.72,
});
const statuses: Record<(typeof ErrorCode.options)[number], number> = {
  INVALID_INPUT: 400,
  INVALID_CURSOR: 400,
  SNAPSHOT_UNAVAILABLE: 400,
  NOT_AUTHORIZED: 403,
  RATE_LIMITED: 429,
  COST_LIMIT_REACHED: 429,
  QUERY_TIMEOUT: 504,
  CONFLICT: 409,
  UNSUPPORTED_TOOL: 400,
};
const noLeads = {
  list: () => {
    throw Error("No lead read expected");
  },
  create: () => {
    throw Error("No lead creation expected");
  },
  update: () => {
    throw Error("No lead update expected");
  },
};
function fixture(
  raw: string,
  checkRequest?: (init: RequestInit | undefined) => void,
) {
  let calls = 0;
  const origin = "https://synthetic-oracle.example.test";
  const client = createHostedOracleClient(
    origin,
    [origin],
    "synthetic-cookie",
    async (_url, init) => {
      calls++;
      checkRequest?.(init);
      return new Response(raw, {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  return {
    client,
    calls: () => calls,
    handler: createLambdaHandler(createApp({ oracle: client, leads: noLeads })),
  };
}
it("preserves every shared contract code through the actual hosted client and gateway status mapping", async () => {
  expect([...ErrorCode.options].sort()).toEqual(Object.keys(statuses).sort());
  for (const code of ErrorCode.options) {
    const message = "Synthetic producer refusal";
    const f = fixture(JSON.stringify({ code, message }));
    const response = await f.handler({
      rawPath: "/api/search",
      body: JSON.stringify(query),
      requestContext: { http: { method: "POST" } },
    });
    expect(response.statusCode).toBe(statuses[code]);
    expect(JSON.parse(response.body)).toEqual({ code, message });
    expect(f.calls()).toBe(1);
  }
});
it("preserves the actual producer's stronger-tenure qualification and never substitutes the narrower deed query", async () => {
  const message =
    "Ownership tenure is unknown; legal continuity is unestablished. The separate minRecordedDeedGapYears filter supports only a bounded current-PIN official-index no-observed-deed gap; it does not establish unchanged ownership.";
  const requested = { ...query, minOwnershipYears: 10 };
  const f = fixture(
    JSON.stringify({ code: "UNSUPPORTED_TOOL", message }),
    (init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        minOwnershipYears: 10,
      });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty(
        "minRecordedDeedGapYears",
      );
    },
  );
  const response = await f.handler({
    rawPath: "/api/search",
    body: JSON.stringify(requested),
    requestContext: { http: { method: "POST" } },
  });
  expect(response.statusCode).toBe(400);
  expect(JSON.parse(response.body)).toEqual({
    code: "UNSUPPORTED_TOOL",
    message,
  });
  expect(f.calls()).toBe(1);
});
it("unknown, malformed and prototype-shaped producer codes fail closed without coercion or pollution", async () => {
  for (const raw of [
    '{"code":"UNKNOWN_FUTURE"}',
    '{"code":"constructor"}',
    '{"code":"toString"}',
    '{"code":"__proto__"}',
    '{"code":["CONFLICT"]}',
    '{"code":{"value":"CONFLICT"}}',
    '{"code":null}',
    '{"code":429}',
    '{"code":true}',
    "null",
    "[]",
    '"UNSUPPORTED_TOOL"',
    "42",
    '{"__proto__":{"code":"CONFLICT"}}',
    '{"constructor":{"prototype":{"code":"CONFLICT"}}}',
    '{"code":"CONFLICT",',
    "not-json",
    "",
  ]) {
    const f = fixture(raw);
    await expect(f.client.search(query)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(f.calls()).toBe(1);
    expect(Object.prototype).not.toHaveProperty("code");
  }
});
it("only own producer fields can choose the code and message even with inherited fields present", async () => {
  const previousCode = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "code",
    ),
    previousMessage = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "message",
    );
  try {
    Object.defineProperty(Object.prototype, "code", {
      value: "CONFLICT",
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Object.prototype, "message", {
      value: "synthetic-inherited-message",
      configurable: true,
      writable: true,
    });
    const f = fixture("{}");
    await expect(f.client.search(query)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Oracle query failed",
    });
    const own = fixture(
      '{"code":"UNSUPPORTED_TOOL","message":"Synthetic own qualification","__proto__":{"code":"CONFLICT"}}',
    );
    await expect(own.client.search(query)).rejects.toMatchObject({
      code: "UNSUPPORTED_TOOL",
      message: "Synthetic own qualification",
    });
  } finally {
    if (previousCode)
      Object.defineProperty(Object.prototype, "code", previousCode);
    else Reflect.deleteProperty(Object.prototype, "code");
    if (previousMessage)
      Object.defineProperty(Object.prototype, "message", previousMessage);
    else Reflect.deleteProperty(Object.prototype, "message");
  }
});
it("retains a recognized code with the fixed fallback for missing or nonstring messages", async () => {
  for (const body of [
    { code: "COST_LIMIT_REACHED" },
    { code: "UNSUPPORTED_TOOL", message: {} },
    { code: "CONFLICT", message: null },
  ]) {
    const f = fixture(JSON.stringify(body));
    await expect(f.client.search(query)).rejects.toMatchObject({
      code: body.code,
      message: "Oracle query failed",
    });
  }
});
it("generic loopback consumers use the same contract taxonomy without adding a request retry", async () => {
  let calls = 0;
  const client = new OracleClient("http://127.0.0.1:4310", async () => {
    calls++;
    return Response.json(
      { code: "UNSUPPORTED_TOOL", message: "Synthetic qualified refusal" },
      { status: 400 },
    );
  });
  await expect(client.search(query)).rejects.toMatchObject({
    code: "UNSUPPORTED_TOOL",
  });
  expect(calls).toBe(1);
});
