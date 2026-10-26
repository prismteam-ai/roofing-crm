import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifySignInError } from "../../src/auth/signIn.js";

describe("classifySignInError (T020, AC-3: never a raw/generic error)", () => {
  it("classifies the lockout handler's message as lockout, with the exact typed text", () => {
    const result = classifySignInError(
      new Error("Too many attempts — try again in 5 minutes (retry at 2026-10-23T00:05:00.000Z)."),
    );
    expect(result.kind).toBe("lockout");
    expect(result.message).toBe("Too many attempts — try again in 5 minutes.");
  });

  it("classifies a NotAuthorizedException as invalid-credentials", () => {
    const error = Object.assign(new Error("Incorrect username or password."), {
      code: "NotAuthorizedException",
    });
    const result = classifySignInError(error);
    expect(result.kind).toBe("invalid-credentials");
    // The board's wording (CrmSignInError390): never says which of the two was wrong.
    expect(result.message).toBe("Wrong email or password. Check the test login you were sent.");
  });

  it("falls back to a typed unknown message, never the raw error, for anything else", () => {
    const result = classifySignInError(new Error("ECONNRESET at line 42"));
    expect(result.kind).toBe("unknown");
    expect(result.message).toBe("Sign-in failed. Please try again.");
  });
});

// TD-5: signIn() itself — previously only classifySignInError (the pure classification logic)
// was unit-tested; the actual SRP call and the reportFailedAttempt reporting it wraps were not.
// Mocks amazon-cognito-identity-js and @crm/api-client at the module boundary.
const authenticateUserMock = vi.fn();
const reportFailedAttemptMock = vi.fn();

vi.mock("../../src/auth/config.js", () => ({
  loadCognitoWebConfig: () => ({ userPoolId: "eu-north-1_test", userPoolClientId: "test-client" }),
}));
vi.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: class {
    constructor(public options: unknown) {}
  },
  CognitoUser: class {
    authenticateUser = authenticateUserMock;
    constructor(public options: unknown) {}
  },
  AuthenticationDetails: class {
    constructor(public options: unknown) {}
  },
}));
vi.mock("@crm/api-client", () => ({
  createApiClient: () => ({
    auth: { reportFailedAttempt: { mutate: reportFailedAttemptMock } },
  }),
}));

/**
 * expect(promise).rejects.toThrow(message) proved unreliable against this file's mocked,
 * doubly-chained (onFailure → reportFailedAttempt().then() → reject()) rejection path — it
 * reported an empty received message even though the promise genuinely rejected with the right
 * Error (confirmed by awaiting it directly in a try/catch). Awaiting directly and asserting on
 * the caught value sidesteps whatever timing/wrapping issue that matcher had here.
 */
async function expectRejectionMessage(
  promise: Promise<unknown>,
  expected: string | RegExp,
): Promise<void> {
  try {
    await promise;
    expect.unreachable("expected the promise to reject");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof expected === "string") {
      expect(message).toBe(expected);
    } else {
      expect(message).toMatch(expected);
    }
  }
}

describe("signIn (TD-5: the real SRP call + reportFailedAttempt wiring)", () => {
  beforeEach(() => {
    authenticateUserMock.mockReset();
    reportFailedAttemptMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("resolves a Session on a successful sign-in, without reporting a failure", async () => {
    authenticateUserMock.mockImplementation(
      (_details: unknown, callbacks: { onSuccess: (s: unknown) => void }) => {
        callbacks.onSuccess({
          getIdToken: () => ({ getJwtToken: () => "id-token" }),
          getAccessToken: () => ({
            getJwtToken: () => "access-token",
            getExpiration: () => 1735689600,
          }),
          getRefreshToken: () => ({ getToken: () => "refresh-token" }),
        });
      },
    );
    const { signIn } = await import("../../src/auth/signIn.js");
    const session = await signIn("admin@roofing-crm.test", "correct-password");
    expect(session).toEqual({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1735689600 * 1000,
    });
    expect(reportFailedAttemptMock).not.toHaveBeenCalled();
  });

  it("reports the failure and rejects with Cognito's own message when not yet locked", async () => {
    authenticateUserMock.mockImplementation(
      (_details: unknown, callbacks: { onFailure: (e: unknown) => void }) => {
        callbacks.onFailure(
          Object.assign(new Error("Incorrect username or password."), {
            code: "NotAuthorizedException",
          }),
        );
      },
    );
    reportFailedAttemptMock.mockResolvedValue({ ok: true, locked: false });
    const { signIn } = await import("../../src/auth/signIn.js");
    await expectRejectionMessage(
      signIn("admin@roofing-crm.test", "wrong-password"),
      "Incorrect username or password.",
    );
    expect(reportFailedAttemptMock).toHaveBeenCalledWith({ username: "admin@roofing-crm.test" });
  });

  it("rejects with the typed lockout message, not Cognito's, when this attempt crosses the threshold", async () => {
    authenticateUserMock.mockImplementation(
      (_details: unknown, callbacks: { onFailure: (e: unknown) => void }) => {
        callbacks.onFailure(
          Object.assign(new Error("Incorrect username or password."), {
            code: "NotAuthorizedException",
          }),
        );
      },
    );
    reportFailedAttemptMock.mockResolvedValue({ ok: true, locked: true });
    const { signIn } = await import("../../src/auth/signIn.js");
    await expectRejectionMessage(
      signIn("admin@roofing-crm.test", "wrong-password"),
      "Too many attempts — try again in 5 minutes.",
    );
  });

  it("does not report an already-locked rejection as a new failure", async () => {
    authenticateUserMock.mockImplementation(
      (_details: unknown, callbacks: { onFailure: (e: unknown) => void }) => {
        callbacks.onFailure(
          new Error(
            "Too many attempts — try again in 5 minutes (retry at 2026-10-23T00:05:00.000Z).",
          ),
        );
      },
    );
    const { signIn } = await import("../../src/auth/signIn.js");
    await expectRejectionMessage(
      signIn("admin@roofing-crm.test", "wrong-password"),
      /Too many attempts/,
    );
    expect(reportFailedAttemptMock).not.toHaveBeenCalled();
  });

  it("still rejects with the original error if reportFailedAttempt itself fails (best-effort)", async () => {
    authenticateUserMock.mockImplementation(
      (_details: unknown, callbacks: { onFailure: (e: unknown) => void }) => {
        callbacks.onFailure(
          Object.assign(new Error("Incorrect username or password."), {
            code: "NotAuthorizedException",
          }),
        );
      },
    );
    reportFailedAttemptMock.mockRejectedValue(new Error("network error"));
    const { signIn } = await import("../../src/auth/signIn.js");
    await expectRejectionMessage(
      signIn("admin@roofing-crm.test", "wrong-password"),
      "Incorrect username or password.",
    );
  });
});
