// Display helpers shared by the Leads screens: how the CRM names a lead's origin, shows a stored
// instant, and says who "me" is. Raw values from `leads.list` / `leads.get` (ISO instants, enum
// codes, a Cognito id as the assignee) go through here before they reach the screen.
import { loadSession } from "../../auth/session.js";

const ORIGIN_LABELS = { map: "Map", list: "List", agent: "Agent" } as const;

/** "Map", "List" or "Agent": where the lead was created (CRM-HANDOFF section 5, Created from). */
export function originLabel(createdFrom: string): string {
  return ORIGIN_LABELS[createdFrom as keyof typeof ORIGIN_LABELS] ?? createdFrom;
}

/** `Oct 20, 09:14 UTC` (the zone is stated: the store keeps UTC instants), or the raw text when
 *  the value is not a readable instant, never a blank. */
export function leadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
  return `${text} UTC`;
}

/** `2026-10-20 09:14 UTC`, the exact stamp for a tooltip / datetime attribute. */
export function leadTimeExact(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function decode(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (part === undefined || part === "") return {};
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))),
    );
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The ids that mean "the signed-in rep": leads store the caller's Cognito `sub` as the
 *  assignee and the event author. Empty when nobody is signed in or the token is unreadable. */
export function myIds(): readonly string[] {
  const session = loadSession();
  if (session === undefined) return [];
  const claims = decode(session.idToken);
  return [claims.sub, claims["cognito:username"], claims.email].filter(
    (v): v is string => typeof v === "string" && v !== "",
  );
}

/** "Me" for the signed-in rep's own id; any other assignee as stored (no rep directory yet). */
export function personLabel(id: string, mine: readonly string[] = myIds()): string {
  return mine.includes(id) ? "Me" : id;
}
