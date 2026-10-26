// T020: sign-in against the Cognito pool via SRP (amazon-cognito-identity-js implements the SRP
// math in the browser; this is the standard Cognito client SDK, not the "LLM provider SDK" the
// engineering guidelines forbid — that rule is about direct LLM provider calls). Cognito's
// PreAuthentication trigger (apps/api/src/auth/lockout-handler.ts) throws TooManyAttemptsError on
// the 4th consecutive failure; Cognito surfaces that as an authentication failure whose message
// carries our text, never a raw 500/blank screen (research.md, AC-3).
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import { createApiClient } from "@crm/api-client";
import type { Session } from "@crm/shared";
import { loadCognitoWebConfig } from "./config.js";

export type SignInErrorKind = "lockout" | "invalid-credentials" | "unknown";

export interface ClassifiedSignInError {
  readonly kind: SignInErrorKind;
  /** The exact typed message the UI shows — never Cognito's raw exception string (AC-3). */
  readonly message: string;
}

const LOCKOUT_MESSAGE = "Too many attempts — try again in 5 minutes.";
// Board CrmSignInError390: never says which of the two was wrong; names where the login came from.
const INVALID_CREDENTIALS_MESSAGE = "Wrong email or password. Check the test login you were sent.";
const UNKNOWN_MESSAGE = "Sign-in failed. Please try again.";

export function classifySignInError(error: unknown): ClassifiedSignInError {
  const message = error instanceof Error ? error.message : String(error);
  if (/too many attempts/i.test(message)) {
    return { kind: "lockout", message: LOCKOUT_MESSAGE };
  }
  const code = (error as { code?: string } | undefined)?.code;
  if (code === "NotAuthorizedException" || /incorrect username or password/i.test(message)) {
    return { kind: "invalid-credentials", message: INVALID_CREDENTIALS_MESSAGE };
  }
  return { kind: "unknown", message: UNKNOWN_MESSAGE };
}

function toSession(cognitoSession: CognitoUserSession): Session {
  return {
    idToken: cognitoSession.getIdToken().getJwtToken(),
    accessToken: cognitoSession.getAccessToken().getJwtToken(),
    refreshToken: cognitoSession.getRefreshToken().getToken(),
    expiresAt: cognitoSession.getAccessToken().getExpiration() * 1000,
  };
}

export function signIn(username: string, password: string): Promise<Session> {
  const config = loadCognitoWebConfig();
  const pool = new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
  const user = new CognitoUser({ Username: username, Pool: pool });
  const details = new AuthenticationDetails({ Username: username, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (cognitoSession) => resolve(toSession(cognitoSession)),
      onFailure: (error: unknown) => {
        // Found deploying: Cognito's PreAuthentication trigger can't itself observe a failed
        // password (see lockout-handler.ts), so Cognito's own response to this exact attempt
        // still says "incorrect password" even when it's the 4th failure. Report it here — only
        // for a genuine wrong-password rejection, never for an already-locked rejection (that's
        // the gate working correctly, not a new failure to count) — and if this attempt just
        // crossed the threshold, reject with the typed lockout message directly instead of
        // Cognito's, so AC-3's "the 4th attempt" (not the 5th) sees it.
        if (classifySignInError(error).kind !== "invalid-credentials") {
          reject(error as Error);
          return;
        }
        reportFailedAttempt(username)
          .then((locked) => reject(locked ? new Error(LOCKOUT_MESSAGE) : (error as Error)))
          .catch(() => reject(error as Error));
      },
    });
  });
}

/** Best-effort: a reporting failure never masks the original sign-in error. */
function reportFailedAttempt(username: string): Promise<boolean> {
  return createApiClient()
    .auth.reportFailedAttempt.mutate({ username })
    .then((result) => result.locked)
    .catch(() => false);
}
