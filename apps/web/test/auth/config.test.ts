// TD-5: loadCognitoWebConfig was never unit-tested despite accepting an injectable env for
// exactly this purpose.
import { describe, expect, it, vi } from "vitest";
import { loadCognitoWebConfig } from "../../src/auth/config.js";

describe("loadCognitoWebConfig", () => {
  it("returns the pool id and client id from VITE_ env vars", () => {
    const config = loadCognitoWebConfig({
      VITE_COGNITO_USER_POOL_ID: "eu-north-1_example",
      VITE_COGNITO_USER_POOL_CLIENT_ID: "exampleclientid",
    });
    expect(config).toEqual({
      userPoolId: "eu-north-1_example",
      userPoolClientId: "exampleclientid",
    });
  });

  it("throws a clear error when VITE_COGNITO_USER_POOL_ID is missing", () => {
    expect(() =>
      loadCognitoWebConfig({ VITE_COGNITO_USER_POOL_CLIENT_ID: "exampleclientid" }),
    ).toThrow(/Cognito web config missing/);
  });

  it("throws a clear error when VITE_COGNITO_USER_POOL_CLIENT_ID is missing", () => {
    expect(() => loadCognitoWebConfig({ VITE_COGNITO_USER_POOL_ID: "eu-north-1_example" })).toThrow(
      /Cognito web config missing/,
    );
  });

  it("throws when both are empty strings, not just undefined", () => {
    expect(() =>
      loadCognitoWebConfig({ VITE_COGNITO_USER_POOL_ID: "", VITE_COGNITO_USER_POOL_CLIENT_ID: "" }),
    ).toThrow(/Cognito web config missing/);
  });

  // The default argument is `import.meta.env` itself, now typed (src/vite-env.d.ts) rather than
  // double-cast to a string record.
  it("reads import.meta.env by default", () => {
    vi.stubEnv("VITE_COGNITO_USER_POOL_ID", "eu-north-1_fromenv");
    vi.stubEnv("VITE_COGNITO_USER_POOL_CLIENT_ID", "envclientid");
    try {
      expect(loadCognitoWebConfig()).toEqual({
        userPoolId: "eu-north-1_fromenv",
        userPoolClientId: "envclientid",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
