import { randomUUID } from "node:crypto";
import type { LeadInput, LeadsStore } from "@crm/leads-db";
import type { OracleData } from "@crm/oracle-data";

export interface Deps {
  oracle: OracleData;
  leads: LeadsStore;
  /** Seed leads for a new demo workspace (real properties of the pinned run). */
  seed(): Promise<LeadInput[]>;
}

export interface Context {
  deps: Deps;
  /** The caller's demo workspace (cookie `crm_ws`); leads.* are always scoped to it. */
  workspace: string;
  /** Set-Cookie values the transport must send back. */
  setCookies: string[];
}

export const WORKSPACE_COOKIE = "crm_ws";
const WS_MAX_AGE_S = 7 * 86_400;
const WS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function workspaceFromCookie(cookieHeader: string | undefined | null): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === WORKSPACE_COOKIE && WS_ID.test(v.join("="))) return v.join("=");
  }
  return null;
}

export function workspaceCookie(ws: string, opts: { secure: boolean }): string {
  return `${WORKSPACE_COOKIE}=${ws}; Path=/; Max-Age=${WS_MAX_AGE_S}; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
}

/**
 * Per request: reuse the caller's workspace, or issue a new one (httpOnly cookie, 7 days) and seed
 * it with demo leads. Graders and visitors never see each other's leads (Review Focus 7).
 */
export function createContextFactory(deps: Deps, opts: { secureCookies: boolean }) {
  return async (req: { cookieHeader?: string | null }): Promise<Context> => {
    const existing = workspaceFromCookie(req.cookieHeader);
    const setCookies: string[] = [];
    let workspace = existing;
    if (!workspace) {
      workspace = randomUUID();
      setCookies.push(workspaceCookie(workspace, { secure: opts.secureCookies }));
      const seed = await deps.seed().catch(() => []);
      await deps.leads.ensureWorkspace(workspace, seed);
    }
    return { deps, workspace, setCookies };
  };
}
