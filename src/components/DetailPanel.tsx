import { useEffect, useState } from "react";
import { permitsForProperty, propertyByKey } from "../lib/queries";
import type { Permit, PermitLead, Property } from "../lib/types";

interface Props {
  propertyKey: string; onClose: () => void;
  hasLead: (key: string, permitNo: string | null) => boolean;
  onAddLead: (p: Property, permit?: PermitLead) => void;
}

export default function DetailPanel({ propertyKey, onClose, hasLead, onAddLead }: Props) {
  const [prop, setProp] = useState<Property | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setProp(null); setPermits([]); setErr(null);
    Promise.all([propertyByKey(propertyKey), permitsForProperty(propertyKey)])
      .then(([p, pm]) => { if (live) { setProp(p); setPermits(pm); } })
      .catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [propertyKey]);

  if (err) return <aside className="detail"><button className="close" onClick={onClose}>×</button><div className="notice error">{err}</div></aside>;
  if (!prop) return <aside className="detail"><button className="close" onClick={onClose}>×</button><div className="notice">Loading…</div></aside>;

  const asLead = (pm?: Permit) => ({ ...prop, ...(pm ?? {}) }) as unknown as PermitLead;
  return (
    <aside className="detail">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3>{prop.situs_address ?? "(no address)"}</h3>
      <p className="muted">{prop.town_or_city} · SBL {prop.print_key_code} · {prop.property_class_description ?? prop.property_class}</p>

      <section>
        <h4>Roof age (estimate)</h4>
        <p><b>{prop.roof_age_years != null ? `≈ ${prop.roof_age_years} years` : "Unknown"}</b>
          {prop.roof_year != null && ` (since ~${prop.roof_year})`} {prop.roof_age_confidence && <i className={`pill ${prop.roof_age_confidence}`}>{prop.roof_age_confidence} confidence</i>}</p>
        <p className="muted">Basis: {prop.roof_age_basis}{prop.evidence_permit_no ? ` (permit ${prop.evidence_permit_no})` : ""}. {prop.roof_age_caveat}</p>
      </section>

      <section>
        <h4>Owner</h4>
        <p>{prop.owner_name ?? "n/a"}</p>
        <p className="muted">
          Mailing: {prop.mailing_city ?? "?"}, {prop.mailing_state ?? "?"} ({prop.owner_location_class ?? "unknown"}).
          Ownership: {prop.ownership_signal?.replaceAll("_", " ") ?? "n/a"} (5 yearly rolls only, can't prove a long hold).
        </p>
      </section>

      <section>
        <h4>Permits ({permits.length})</h4>
        {permits.length === 0 && <p className="muted">No Oyster Bay eTRAKiT permits loaded for this property. Permit data covers the Hicksville demo area only.</p>}
        {permits.map((pm) => (
          <div key={pm.permit_no} className="permit">
            <div><b>{pm.permit_no}</b> · {pm.permit_type}{pm.permit_subtype ? ` / ${pm.permit_subtype}` : ""}</div>
            <div>Status: <b>{pm.status}</b> ({pm.status_class}{!pm.status_known ? ", unrecognized status" : ""}){pm.past_expiration ? " · past expiration" : ""}</div>
            <div>{pm.years_open != null ? `Open ${pm.years_open.toFixed(1)} yrs (since ${pm.open_since}, basis ${pm.open_since_basis})` : pm.close_date ? `Closed ${pm.close_date}` : "Open duration unknown"}</div>
            <div className="muted">Applied {pm.applied_date ?? "?"} · Issued {pm.issued_date ?? "?"} · Finaled {pm.finaled_date ?? "?"}</div>
            <div>Roofing: <i className={`pill ${pm.is_roofing ? "high" : pm.roofing_confidence}`}>{pm.is_roofing ? "roofing" : pm.roofing_confidence}</i> <span className="muted">{pm.roofing_basis_summary}</span></div>
            <div>Contractor: {pm.contractor_name ?? "n/a"} · BBB: <span className="muted">{pm.bbb_score ?? "not available (no BBB data yet)"}</span></div>
            {pm.trade_contacts && <div className="muted">Contacts: {pm.trade_contacts}</div>}
            {pm.job_description && <div className="muted">Job: {pm.job_description}</div>}
            <button disabled={hasLead(prop.property_key, pm.permit_no)} onClick={() => onAddLead(prop, asLead(pm))}>
              {hasLead(prop.property_key, pm.permit_no) ? "Lead saved" : "Create lead from this permit"}
            </button>
          </div>
        ))}
      </section>

      <section>
        <h4>Contractor reputation</h4>
        <p>BBB rating score: <span className="muted">{prop.bbb_score ?? "not available"}</span></p>
        <p className="muted">Documented gap: BBB data has not been collected yet (nullable field, shown when present).</p>
      </section>

      <button className="primary" disabled={hasLead(prop.property_key, null)} onClick={() => onAddLead(prop)}>
        {hasLead(prop.property_key, null) ? "Lead saved" : "Create lead from this roof"}
      </button>
    </aside>
  );
}
