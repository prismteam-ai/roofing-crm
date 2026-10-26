// Shell UI fix (B-01 spec step 10 relies on Sign out): signOut() clears the CRM session
// (`crm.session`) and the Cognito SDK's own cached user, and never throws when the Cognito
// config is missing (a unit-test or misconfigured build must still be able to sign out).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkSignOut = vi.fn();
const getCurrentUser = vi.fn(() => ({ signOut: sdkSignOut }));
const poolArgs: unknown[] = [];
vi.mock("amazon-cognito-identity-js", () => ({
  CognitoUserPool: class {
    constructor(args: unknown) {
      poolArgs.push(args);
    }
    getCurrentUser = getCurrentUser;
  },
}));

const configMock = vi.fn();
vi.mock("../../src/auth/config.js", () => ({ loadCognitoWebConfig: () => configMock() }));

import { identityFromSession } from "../../src/auth/identity";
import { signOut } from "../../src/auth/signOut";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
}

beforeEach(() => {
  localStorage.clear();
  sdkSignOut.mockClear();
  getCurrentUser.mockClear();
  poolArgs.length = 0;
  configMock.mockReset();
});
afterEach(() => localStorage.clear());

describe("signOut", () => {
  it("removes crm.session and clears the Cognito SDK's cached user", () => {
    configMock.mockReturnValue({ userPoolId: "eu-north-1_abc", userPoolClientId: "client" });
    localStorage.setItem("crm.session", "{}");
    signOut();
    expect(localStorage.getItem("crm.session")).toBeNull();
    expect(poolArgs).toEqual([{ UserPoolId: "eu-north-1_abc", ClientId: "client" }]);
    expect(sdkSignOut).toHaveBeenCalledTimes(1);
  });

  it("still clears crm.session when the Cognito config is missing", () => {
    configMock.mockImplementation(() => {
      throw new Error("Cognito web config missing");
    });
    localStorage.setItem("crm.session", "{}");
    expect(() => signOut()).not.toThrow();
    expect(localStorage.getItem("crm.session")).toBeNull();
    expect(sdkSignOut).not.toHaveBeenCalled();
  });
});

describe("identityFromSession", () => {
  const base = { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 60_000 };

  it("reads the email, username and groups the ID token carries", () => {
    const idToken = jwt({
      email: "rep@example.test",
      "cognito:username": "rep",
      "cognito:groups": ["admins"],
    });
    expect(identityFromSession({ ...base, idToken })).toEqual({
      email: "rep@example.test",
      username: "rep",
      groups: ["admins"],
    });
  });

  it("returns nulls and no groups for a token it cannot read (never invents a name)", () => {
    expect(identityFromSession({ ...base, idToken: "not-a-jwt" })).toEqual({
      email: null,
      username: null,
      groups: [],
    });
    expect(identityFromSession(undefined)).toEqual({ email: null, username: null, groups: [] });
  });
});
