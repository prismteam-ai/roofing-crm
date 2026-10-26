import { describe, expect, it } from "vitest";
import { Session } from "../../src/schemas/session.js";

describe("Session schema (T019, data-model.md)", () => {
  it("accepts a well-formed session", () => {
    const parsed = Session.safeParse({
      idToken: "id",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a session missing a token", () => {
    const parsed = Session.safeParse({
      idToken: "id",
      accessToken: "access",
      expiresAt: Date.now(),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-positive expiresAt", () => {
    const parsed = Session.safeParse({
      idToken: "id",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: -1,
    });
    expect(parsed.success).toBe(false);
  });
});
