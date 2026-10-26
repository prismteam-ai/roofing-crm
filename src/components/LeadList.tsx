import type { PermitLead, Property } from "../lib/types";

interface Props {
  tab: "roofs" | "permits"; onTab: (t: "roofs" | "permits") => void;
  roofs: Property[]; roofsTotal: number; permits: PermitLead[]; loading: boolean; error: string | null;
  selectedKey: string | null; onSelect: (propertyKey: string) => void;
  permitCounts: Record<string, number>; permitFilter: string; onWiden: () => void; maxRows: number;
}

export const conf = (c: string | null) => (c ? c : "unknown");

export default function LeadList(p: Props) {
  const openAll = Object.values(p.permitCounts).reduce((a, b) => a + b, 0);
  const lowCands = (p.permitCounts.low ?? 0) + (p.permitCounts.medium ?? 0) + (p.permitCounts.high ?? 0);
  return (
    <div className="list">
      <div className="tabs">
        <button className={p.tab === "roofs" ? "active" : ""} onClick={() => p.onTab("roofs")}>Aging roofs ({p.roofsTotal.toLocaleString()})</button>
        <button className={p.tab === "permits" ? "active" : ""} onClick={() => p.onTab("permits")}>Open permits ({p.permits.length.toLocaleString()})</button>
      </div>
      {p.error && <div className="notice error">Data error: {p.error}</div>}
      {p.loading && <div className="notice">Loading…</div>}
      {p.tab === "roofs" && (
        <>
          {p.roofsTotal > p.maxRows && <div className="notice">Showing the oldest {p.maxRows.toLocaleString()} of {p.roofsTotal.toLocaleString()}. Narrow the radius to see all.</div>}
          <ul>
            {p.roofs.map((r) => (
              <li key={r.property_key} className={r.property_key === p.selectedKey ? "sel" : ""} onClick={() => p.onSelect(r.property_key)}>
                <b>{r.situs_address ?? "(no address)"}</b>
                <span>Roof ≈ {r.roof_age_years} yrs <i className={`pill ${conf(r.roof_age_confidence)}`}>{conf(r.roof_age_confidence)} confidence</i></span>
                <small>{r.miles.toFixed(2)} mi · {r.property_class_description ?? r.property_class ?? ""}</small>
              </li>
            ))}
            {!p.loading && p.roofs.length === 0 && <li className="empty">No roofs this old in the radius. Lower the age or widen the radius.</li>}
          </ul>
        </>
      )}
      {p.tab === "permits" && (
        <ul>
          {p.permits.map((r) => (
            <li key={r.permit_no} className={r.property_key === p.selectedKey ? "sel" : ""} onClick={() => p.onSelect(r.property_key)}>
              <b>{r.situs_address ?? "(no address)"}</b>
              <span>
                {r.permit_no} · {r.status}{!r.status_known && " (unrecognized status)"}
                {" · "}{r.years_open != null ? `open ${r.years_open.toFixed(1)} yrs` : "open duration unknown"}
                {r.past_expiration && <i className="pill warnpill">past expiration</i>}
              </span>
              <small>
                <i className={`pill ${r.is_roofing ? "high" : r.roofing_confidence}`}>{r.is_roofing ? "roofing" : `roofing: ${r.roofing_confidence}`}</i>
                {r.contractor_name ? ` ${r.contractor_name}` : " contractor n/a"} · {r.miles.toFixed(2)} mi
              </small>
            </li>
          ))}
          {!p.loading && p.permits.length === 0 && (
            <li className="empty">
              No open permits match in this radius.
              {p.permitFilter === "roofing" && openAll > 0 && (
                <> There are {openAll} open permits here, but none is classified roofing at medium/high confidence yet
                {lowCands > 0 ? <> ({lowCands} low-confidence candidates). <button className="link" onClick={p.onWiden}>Include low-confidence candidates</button></> : "."}</>
              )}
              {openAll === 0 && <> Permit data only covers the Hicksville demo area (Town of Oyster Bay, in progress), so try a pin near Hicksville.</>}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
