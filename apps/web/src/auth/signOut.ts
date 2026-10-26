// Sign out (B-01 spec step 10; board CrmAccount / CrmBottomNav "Sign out"): clears the CRM's own
// session (`crm.session`, session.ts) and the Cognito SDK's cached user (its
// `CognitoIdentityServiceProvider.*` localStorage keys, written by signIn.ts's SRP flow), so a
// reload lands on sign-in instead of silently restoring the user. Local only: the caller clears
// the React Query cache and routes to /sign-in (components/AppShell/useSignOut.ts).
import { CognitoUserPool } from "amazon-cognito-identity-js";
import { loadCognitoWebConfig } from "./config.js";
import { clearSession } from "./session.js";

export function signOut(): void {
  clearSession();
  try {
    const config = loadCognitoWebConfig();
    const pool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.userPoolClientId,
    });
    pool.getCurrentUser()?.signOut();
  } catch {
    // No Cognito config in this build (or an unparseable pool id): the SDK never cached a user,
    // and the CRM session above is already gone, so the rep is signed out either way.
  }
}
