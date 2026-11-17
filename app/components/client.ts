"use client";

/**
 * Browser-side helpers shared by the CRM's screens.
 *
 * A workspace is a random ID kept in this browser. It scopes saved leads so
 * visitors to the public demo do not see each other's records. It is not a login.
 */
export type Row = Record<string, string | number | boolean | null>;

export interface Lead {
  leadId: string;
  folio: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  owner: string | null;
  reason: "aging_roof" | "open_permit";
  roofYear: number | null;
  roofBasis: string | null;
  permitNumber: string | null;
  permitIssued: string | null;
  permitStatus: string | null;
  contractor: string | null;
  contractorLicence: string | null;
  lat: number | null;
  lon: number | null;
  snapshotId: string;
  sourceUrl: string | null;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  priority: "high" | "normal" | "low";
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function workspace(): string {
  const KEY = "roofing-crm-workspace";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private window): keep one workspace for this page load.
    return (sessionWorkspace ??= crypto.randomUUID());
  }
}
let sessionWorkspace: string | null = null;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", "x-workspace": workspace(), ...(init.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export const STATUS_LABEL: Record<string, string> = {
  no_inspection: "No inspection recorded",
  last_inspection_not_approved: "Last inspection not approved",
  last_inspection_approved: "Last inspection approved",
  closed_certificate: "Certificate issued",
};
export const num = (value: unknown) => (value === null || value === undefined ? "—" : Number(value).toLocaleString("en-US"));
export const yearsOpen = (days: unknown) => (days === null || days === undefined ? "—" : `${(Number(days) / 365.25).toFixed(1)} yr`);
