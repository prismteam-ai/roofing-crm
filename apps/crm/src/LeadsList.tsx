import { useMemo, useState } from "react";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@roofing-crm/leads-client";

/**
 * Leads, filtered at read time: by status, and "Leads in this search" (the parcels of the current radius and
 * roof-age result). Nothing derived is stored with a lead. Permit filters wait for permit data.
 */
export function LeadsList({
  leads,
  searchIds,
  error,
  onOpen,
}: {
  leads: Lead[];
  /** Parcel IDs of the current search result (radius + roof age), if there is one. */
  searchIds?: Set<string>;
  error?: string;
  onOpen: (parcelId: string) => void;
}) {
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [inSearch, setInSearch] = useState(false);
  const shown = useMemo(
    () =>
      leads
        .filter((l) => status === "all" || l.status === status)
        .filter((l) => !inSearch || !!searchIds?.has(l.parcel_id))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [leads, status, inSearch, searchIds],
  );
  return (
    <section className="leads" data-testid="leads">
      <h3>
        Leads <span data-testid="leads-count">{shown.length}</span> /{" "}
        {leads.length}
      </h3>
      <div className="row">
        <select
          aria-label="Lead status filter"
          data-testid="leads-status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value as LeadStatus | "all")}
        >
          <option value="all">all statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            data-testid="leads-in-search"
            disabled={!searchIds}
            checked={inSearch}
            onChange={(e) => setInSearch(e.target.checked)}
          />{" "}
          Leads in this search
        </label>
      </div>
      <label className="notice">
        <select disabled aria-label="Permit status filter">
          <option>permit status</option>
        </select>{" "}
        Permit filters: permits are not harvested yet.
      </label>
      {error && (
        <p className="error" data-testid="leads-error">
          {error}
        </p>
      )}
      <ul className="list">
        {shown.map((l) => (
          <li
            key={l.parcel_id}
            data-testid="lead-item"
            data-parcel={l.parcel_id}
            onClick={() => onOpen(l.parcel_id)}
          >
            <b>{l.parcel_id}</b> · {l.status} · updated{" "}
            {l.updated_at.slice(0, 10)}
          </li>
        ))}
      </ul>
    </section>
  );
}
