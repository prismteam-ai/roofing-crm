// B-09 review follow-up: the agent turn's hard stop lives in one place. The API's abort timer
// (apps/api/src/agent/runAgent.ts), the Ask screen's "stopped at the N s limit" copy
// (apps/web/src/routes/Ask/askCopy.ts) and the infra test of the tRPC Lambda's 28 s timeout all
// read this constant; each of those has its own test pinning that it does.
import { describe, expect, it } from "vitest";
import { AGENT_TURN_LIMIT_MS as fromIndex } from "../../src/index.js";
import { AGENT_TURN_LIMIT_MS } from "../../src/agent/limits.js";

describe("AGENT_TURN_LIMIT_MS (ADR-06 §6.1 nested timeouts)", () => {
  it("is 23 000 ms, a whole number of seconds", () => {
    expect(AGENT_TURN_LIMIT_MS).toBe(23_000);
    expect(AGENT_TURN_LIMIT_MS % 1000).toBe(0);
  });

  it("is re-exported from the package index", () => {
    expect(fromIndex).toBe(AGENT_TURN_LIMIT_MS);
  });
});
