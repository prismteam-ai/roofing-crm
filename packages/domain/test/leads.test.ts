// tasks.md T005 (B-07): pure lead rules. Lives in test/ because packages/domain/vitest.config.ts
// only includes test/**/*.test.ts (tasks.md names tests/packages/domain/, which is not collected).
import { describe, expect, it } from "vitest";
import { isNotInCurrentRun, leadKey, requestIdentifierOf } from "../src/leads.js";

describe("leadKey", () => {
  it("builds {fips}:tcad:{request_identifier} (ADR-04, never property_cid)", () => {
    expect(leadKey("48453", "R123456")).toBe("48453:tcad:R123456");
  });

  it("is deterministic for the same inputs", () => {
    expect(leadKey("48453", "R1")).toBe(leadKey("48453", "R1"));
  });

  it("rejects an empty fips or request identifier", () => {
    expect(() => leadKey("", "R1")).toThrow();
    expect(() => leadKey("48453", "")).toThrow();
  });
});

describe("isNotInCurrentRun", () => {
  it("is false when the source manifest is the current manifest", () => {
    expect(isNotInCurrentRun("bafyA", "bafyA")).toBe(false);
  });

  it("is true when the source manifest differs from the current manifest", () => {
    expect(isNotInCurrentRun("bafyA", "bafyB")).toBe(true);
  });
});

describe("requestIdentifierOf", () => {
  it("returns the part after the first :tcad:", () => {
    expect(requestIdentifierOf("48453:tcad:R1")).toBe("R1");
  });

  it("keeps an identifier that itself contains :tcad:", () => {
    expect(requestIdentifierOf(leadKey("48453", "A:tcad:B"))).toBe("A:tcad:B");
  });

  it("returns an empty string when the key has no :tcad: marker", () => {
    expect(requestIdentifierOf("nonsense")).toBe("");
  });
});
