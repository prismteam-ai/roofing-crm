// Who is signed in, for the account menu (board CrmAccount): read from the Cognito ID token's
// payload in the stored session. Display only — the API Gateway JWT authorizer, not this code,
// verifies the token. A token this cannot read gives nulls, never an invented name or role.
import type { Session } from "@crm/shared";

export interface SessionIdentity {
  readonly email: string | null;
  readonly username: string | null;
  readonly groups: readonly string[];
}

const NOBODY: SessionIdentity = { email: null, username: null, groups: [] };

function decodePayload(jwt: string): Record<string, unknown> | undefined {
  const part = jwt.split(".")[1];
  if (part === undefined || part === "") return undefined;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const str = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

export function identityFromSession(session: Session | undefined): SessionIdentity {
  if (session === undefined) return NOBODY;
  const payload = decodePayload(session.idToken);
  if (payload === undefined) return NOBODY;
  const groups = payload["cognito:groups"];
  return {
    email: str(payload.email),
    username: str(payload["cognito:username"]),
    groups: Array.isArray(groups) ? groups.filter((g): g is string => typeof g === "string") : [],
  };
}
