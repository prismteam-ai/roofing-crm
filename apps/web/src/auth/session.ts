// data-model.md "Session (client-held, Cognito-issued)": no CRM-owned table backs this — it is
// entirely Cognito + browser storage (T019's @crm/shared Session schema). Survives a reload
// (spec.md edge case) via localStorage; an expired session with no valid refresh returns the rep
// to sign-in, never a blank screen.
import { Session } from "@crm/shared";

const STORAGE_KEY = "crm.session";

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): Session | undefined {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return undefined;
  try {
    const parsed = Session.safeParse(JSON.parse(raw));
    if (!parsed.success) return undefined;
    if (parsed.data.expiresAt <= Date.now()) {
      clearSession();
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
