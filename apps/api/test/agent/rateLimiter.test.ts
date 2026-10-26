// T015 (Phase 2 Foundational): the `crm-agent-usage` rate-limit guard — 5 asks/min/user, enforced
// by one atomic conditional DynamoDB UpdateItem per check (same pattern as leadRepo.ts's
// `expectedSequence` conditional update, data-model.md "agent usage / rate+spend guard"). DynamoDB
// itself is doubled with aws-sdk-client-mock (apps/api/test/duckDbParquet.test.ts's own pattern);
// nothing reaches AWS. `apps/api/src/agent/rateLimiter.ts` does not exist yet — this test must
// fail on import/assertion, not on an unrelated syntax error, until T018 implements it.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createRateLimiter, RATE_LIMIT_PER_MINUTE } from "../../src/agent/rateLimiter.js";
import { RateLimitedError } from "../../src/agentErrors.js";

const ddbMock = mockClient(DynamoDBDocumentClient);

function conditionalCheckFailed(): Error {
  return Object.assign(new Error("The conditional request failed"), {
    name: "ConditionalCheckFailedException",
  });
}

function makeLimiter(now: () => Date = () => new Date("2026-10-24T10:00:00.000Z")) {
  return createRateLimiter({
    tableName: "crm-agent-usage",
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    now,
  });
}

describe("rateLimiter (T015)", () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it("allows the first RATE_LIMIT_PER_MINUTE asks in the same window", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const limiter = makeLimiter();

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      await expect(limiter.check("user-1")).resolves.toBeUndefined();
    }
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(RATE_LIMIT_PER_MINUTE);
  });

  it("rejects the 6th concurrent call in the same window with RateLimitedError (the conditional write fails)", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());
    const limiter = makeLimiter();

    await expect(limiter.check("user-1")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("sends one atomic conditional UpdateItem per check, keyed by user + window-minute, condition guarding count < limit", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const limiter = makeLimiter(() => new Date("2026-10-24T10:00:00.000Z"));

    await limiter.check("user-42");

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]?.args[0]?.input;
    expect(input?.TableName).toBe("crm-agent-usage");
    expect(input?.Key?.pk).toBe("USER#user-42#MIN#29880600");
    expect(input?.ConditionExpression).toMatch(/attribute_not_exists\(pk\)\s+OR/);
    expect(input?.ExpressionAttributeValues?.[":limit"]).toBe(RATE_LIMIT_PER_MINUTE);
  });

  it("propagates an unrelated DynamoDB error unchanged (never masked as RateLimitedError)", async () => {
    ddbMock.on(UpdateCommand).rejects(new Error("ProvisionedThroughputExceededException"));
    const limiter = makeLimiter();

    await expect(limiter.check("user-1")).rejects.not.toBeInstanceOf(RateLimitedError);
  });

  it("resets the limit once the window-minute changes", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    let nowMs = new Date("2026-10-24T10:00:59.000Z").getTime();
    const limiter = makeLimiter(() => new Date(nowMs));

    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) await limiter.check("user-1");
    nowMs += 1_000; // crosses into the next minute bucket
    await expect(limiter.check("user-1")).resolves.toBeUndefined();

    const keys = ddbMock
      .commandCalls(UpdateCommand)
      .map((c) => c.args[0]?.input?.Key?.pk as string);
    expect(new Set(keys).size).toBe(2);
  });

  // CR finding 3: the Ask screen's throttled state can say how long to wait — seconds to the
  // next UTC minute window, computed by the limiter that owns the window.
  it("carries retryAfterSec = seconds until the next minute window", async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());
    const limiter = makeLimiter(() => new Date("2026-10-24T10:00:20.500Z"));

    const error = await limiter.check("user-1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterSec).toBe(40);
  });

  // CR finding 6c: agent.confirmLead gets the same 5/min/user limit, in its own window so a rep
  // who just asked 5 questions can still confirm a proposal.
  it("keys the confirm scope separately from asks, same limit", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const limiter = makeLimiter(() => new Date("2026-10-24T10:00:00.000Z"));

    await limiter.check("user-42", "confirm");

    const input = ddbMock.commandCalls(UpdateCommand)[0]?.args[0]?.input;
    expect(input?.Key?.pk).toBe("USER#user-42#CONFIRM#MIN#29880600");
    expect(input?.ExpressionAttributeValues?.[":limit"]).toBe(RATE_LIMIT_PER_MINUTE);
  });
});
