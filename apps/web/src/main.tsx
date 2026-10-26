import { createApiClient } from "@crm/api-client";
import { ApiProvider } from "@crm/api-client/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadSession } from "./auth/session.js";
import { App } from "./App.js";
import "./styles/tokens.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("#root not found");
}

// B-03: the shared tRPC/React Query client (packages/api-client), so Map.tsx and later screens
// call search.properties/search.permits/property.get through the one client every app imports —
// never a page-local fetch or a second client (plan.md "Shared Client Package").
//
// Found live on the hosted preview (every authenticated procedure returned API Gateway 401,
// confirmed in the access logs — the Lambda itself was never even invoked): nothing in this repo
// had ever wired the Cognito session into the shared client's headers before this story, since
// every prior screen either called no procedure (B-01) or only unauthenticated ones
// (health.ping, auth.reportFailedAttempt). The HTTP JWT authorizer validates the ID token (its
// `aud` claim matches the user pool client), not the access token. A session that has expired or
// was never signed in simply sends no Authorization header — RequireSession.tsx already routes
// that case to sign-in before any query can run, so this never silently retries as anonymous.
const apiClient = createApiClient({
  headers: () => {
    const session = loadSession();
    return session === undefined ? {} : { Authorization: `Bearer ${session.idToken}` };
  },
});

createRoot(container).render(
  <StrictMode>
    <ApiProvider client={apiClient}>
      <App />
    </ApiProvider>
  </StrictMode>,
);
