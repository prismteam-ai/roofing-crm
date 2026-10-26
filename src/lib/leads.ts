import { useCallback, useEffect, useState } from "react";
import type { Lead, PermitLead, Property } from "./types";

const KEY = "roofing-crm.leads.v1"; // localStorage is a deliberate MVP choice (see docs/architecture.md)

function load(): Lead[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // A corrupted value or a stale schema from an earlier version must not be trusted as Lead[] on faith --
    // fall back to empty rather than letting malformed entries reach code that assumes the shape below.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((l): l is Lead => l != null && typeof l === "object" && typeof l.id === "string" && typeof l.property_key === "string");
  } catch { return []; }
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(leads)); } catch { /* storage unavailable: leads live in memory only */ }
  }, [leads]);

  const add = useCallback((p: Property | PermitLead, permit?: PermitLead): void => {
    const property_key = p.property_key;
    const permit_no = permit?.permit_no ?? null;
    setLeads((cur) => {
      if (cur.some((l) => l.property_key === property_key && l.permit_no === permit_no)) return cur;
      const created: Lead = {
        id: crypto.randomUUID(), created_at: new Date().toISOString(), status: "New", notes: "",
        property_key, address: p.situs_address ?? "(no address)", lat: p.lat, lon: p.lon,
        owner_name: "owner_name" in p ? p.owner_name : null,
        out_of_area_owner: "owner_location_class" in p ? ["out_of_state", "ny_outside_nassau"].includes(p.owner_location_class ?? "") : false,
        roof_age_years: p.roof_age_years, roof_age_confidence: p.roof_age_confidence, roof_age_basis: p.roof_age_basis,
        permit_no, permit_status: permit?.status ?? null, permit_open: permit?.is_open ?? null,
        permit_years_open: permit?.years_open ?? null, roofing_confidence: permit?.roofing_confidence ?? null,
        contractor_name: permit?.contractor_name ?? null, bbb_score: permit?.bbb_score ?? null,
      };
      return [created, ...cur];
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Lead>) => setLeads((c) => c.map((l) => (l.id === id ? { ...l, ...patch } : l))), []);
  const remove = useCallback((id: string) => setLeads((c) => c.filter((l) => l.id !== id)), []);
  const has = useCallback((key: string, permitNo: string | null) => leads.some((l) => l.property_key === key && l.permit_no === permitNo), [leads]);
  return { leads, add, update, remove, has };
}
