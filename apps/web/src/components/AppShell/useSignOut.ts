// Sign out from the account menu (>= 600 px) and the More sheet (390): clear the session
// (auth/signOut.ts), drop every cached query so the next rep never sees this rep's leads, and
// land on /sign-in (board CrmSignInSignedOut390). `replace` keeps Back from reopening the shell.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { signOut } from "../../auth/signOut.js";

export function useSignOut(): () => void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useCallback(() => {
    signOut();
    queryClient.clear();
    void navigate("/sign-in", { replace: true, state: { signedOut: true } });
  }, [navigate, queryClient]);
}
