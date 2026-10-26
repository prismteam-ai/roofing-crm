// TD-5: routers/auth.ts's reportFailedAttempt procedure — previously only the pure
// recordFailedAttempt function (lockout-handler.test.ts) was unit-tested; the router/DynamoDB
// wiring that actually runs behind the public endpoint was not. Mocks the AWS SDK at the module
// boundary, same pattern as lockout-handler-envelope.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: sendMock })) },
  GetCommand: class {
    __commandName = "Get";
    constructor(public input: unknown) {}
  },
  PutCommand: class {
    __commandName = "Put";
    constructor(public input: unknown) {}
  },
}));

describe("authRouter.reportFailedAttempt", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env.LOCKOUT_TABLE_NAME = "test-lockout-table";
  });

  afterEach(() => {
    delete process.env.LOCKOUT_TABLE_NAME;
  });

  it("increments the counter and reports locked: false below the 4th failure", async () => {
    sendMock.mockResolvedValueOnce({
      Item: { username: "admin@roofing-crm.test", failedAttempts: 1, lockedUntil: null },
    });
    sendMock.mockResolvedValueOnce({});
    const { authRouter } = await import("../../src/routers/auth.js");
    const caller = authRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.reportFailedAttempt({ username: "admin@roofing-crm.test" });
    expect(result).toEqual({ ok: true, locked: false });
  });

  it("reports locked: true exactly when this attempt crosses the 4th-failure threshold", async () => {
    sendMock.mockResolvedValueOnce({
      Item: { username: "admin@roofing-crm.test", failedAttempts: 3, lockedUntil: null },
    });
    sendMock.mockResolvedValueOnce({});
    const { authRouter } = await import("../../src/routers/auth.js");
    const caller = authRouter.createCaller({ requestId: "test-request-id" });
    const result = await caller.reportFailedAttempt({ username: "admin@roofing-crm.test" });
    expect(result).toEqual({ ok: true, locked: true });
  });

  it("rejects an empty username (Zod input validation)", async () => {
    const { authRouter } = await import("../../src/routers/auth.js");
    const caller = authRouter.createCaller({ requestId: "test-request-id" });
    await expect(caller.reportFailedAttempt({ username: "" })).rejects.toThrow();
  });

  it("throws if LOCKOUT_TABLE_NAME is not set", async () => {
    delete process.env.LOCKOUT_TABLE_NAME;
    const { authRouter } = await import("../../src/routers/auth.js");
    const caller = authRouter.createCaller({ requestId: "test-request-id" });
    await expect(
      caller.reportFailedAttempt({ username: "admin@roofing-crm.test" }),
    ).rejects.toThrow("LOCKOUT_TABLE_NAME is not set");
  });
});
