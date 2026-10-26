import { useMemo, useState } from "react";
import { haversineMiles } from "../lib/geo";
import type { Lead, LeadStatus, Pin } from "../lib/types";

const STATUSES: LeadStatus[] = ["New", "Contacted", "Quoted", "Won", "Lost"];

interface Props {
  leads: Lead[]; pin: Pin; radius: number;
  onUpdate: (id: string, patch: Partial<Lead>) => void; onRemove: (id: string) => void;
}

export default function LeadsView({ leads, pin, radius, onUpdate, onRemove }: Props) {
  const [minAge, setMinAge] = useState(0);
  const [permit, setPermit] = useState<"any" | "open" | "none">("any");
  const [minYearsOpen, setMinYearsOpen] = useState(0);
  const [useRadius, setUseRadius] = useState(false);
  const [status, setStatus] = useState<"all" | LeadStatus>("all");

  const rows = useMemo(() => leads.filter((l) => {
    if (minAge > 0 && (l.roof_age_years ?? -1) < minAge) return false;
    if (permit === "open" && !l.permit_open) return false;
    if (permit === "none" && l.permit_no) return false;
    if (minYearsOpen > 0 && (l.permit_years_open ?? -1) < minYearsOpen) return false;
    if (useRadius && haversineMiles(pin, l) > radius) return false;
    if (status !== "all" && l.status !== status) return false;
    return true;
  }), [leads, minAge, permit, minYearsOpen, useRadius, pin, radius, status]);

  return (
    <div className="leads">
      <div className="filters">
        <label>Roof ≥ <input type="number" min={0} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} /> yrs</label>
        <label>Permit <select value={permit} onChange={(e) => setPermit(e.target.value as typeof permit)}>
          <option value="any">any</option><option value="open">open</option><option value="none">no permit</option></select></label>
        <label>Open ≥ <input type="number" min={0} step={0.5} value={minYearsOpen} onChange={(e) => setMinYearsOpen(Number(e.target.value))} /> yrs</label>
        <label><input type="checkbox" checked={useRadius} onChange={(e) => setUseRadius(e.target.checked)} /> within {radius} mi of map pin</label>
        <label>Status <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">all</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <span className="muted">{rows.length} of {leads.length}</span>
      </div>
      {leads.length === 0 && <p className="muted">No leads yet. On the map, select a roof or permit and choose "Create lead".</p>}
      {rows.length > 0 && (
        <table>
          <thead><tr><th>Address</th><th>Roof age</th><th>Permit</th><th>Contractor / BBB</th><th>Owner</th><th>Status</th><th>Notes</th><th /></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td>{l.address}<br /><small className="muted">{new Date(l.created_at).toLocaleDateString()}</small></td>
                <td>{l.roof_age_years != null ? `≈ ${l.roof_age_years} yrs` : "?"}<br /><small className="muted">{l.roof_age_confidence ?? "unknown"} confidence</small></td>
                <td>{l.permit_no ? <>{l.permit_no}<br /><small>{l.permit_status}{l.permit_years_open != null ? ` · open ${l.permit_years_open.toFixed(1)} yrs` : ""}</small></> : <span className="muted">none</span>}</td>
                <td>{l.contractor_name ?? "n/a"}<br /><small className="muted">BBB {l.bbb_score ?? "n/a"}</small></td>
                <td>{l.owner_name ?? "n/a"}{l.out_of_area_owner && <i className="pill warnpill">out-of-area</i>}</td>
                <td><select value={l.status} onChange={(e) => onUpdate(l.id, { status: e.target.value as LeadStatus })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td>
                <td><input value={l.notes} placeholder="Notes" onChange={(e) => onUpdate(l.id, { notes: e.target.value })} /></td>
                <td><button onClick={() => onRemove(l.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
