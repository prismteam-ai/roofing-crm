// Gates the Map/Coming-soon routes behind the Cognito session from SignIn (T022: "gated behind
// the Cognito JWT session"). An expired/missing session returns the rep to sign-in, never a blank
// screen (data-model.md's Session notes).
import type { ReactElement, ReactNode } from "react";
import { Navigate } from "react-router";
import { loadSession } from "./session.js";

export function RequireSession({ children }: { children: ReactNode }): ReactElement {
  const session = loadSession();
  if (session === undefined) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}
