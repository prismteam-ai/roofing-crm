import { useMemo, useState } from "react";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@roofing-crm/leads-client";
import type { LeadsInSearch } from "./leadsInSearch.ts";

/** The list reads at most this many pages of this many leads. */
export const LEADS_PAGE_SIZE = 100;
export const LEADS_MAX_PAGES = 20;

/**
 * Leads, filtered at read time: by status, and "Leads in this search" (the parcels of the current radius and
 * roof-age result; see leadsInSearch.ts). Nothing derived is stored with a lead. There is no permit-status or
 * open-duration filter: a lead holds no permit data, so such a filter would need each lead's permits from the
 * data API; the disabled control says so.
 */
export function LeadsList({
  leads,
  search,
  inSearch,
  onInSearch,
  error,
  capped,
  onOpen,
}: {
  leads: Lead[];
  /** Which leads the current search result (radius + roof age) matches. */
  search: LeadsInSearch;
  /** The "Leads in this search" filter is on (kept by the app, which only checks leads while it is on). */
  inSearch: boolean;
  onInSearch: (on: boolean) => void;
  error?: string;
  /** More leads are stored than the list loaded (the page limit was reached with a next cursor left). */
  capped?: boolean;
  onOpen: (parcelId: string) => void;
}) {
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const searchIds = search.ids;
  // With the filter on, nothing is listed until the answer is complete (never a partial result).
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
            disabled={!search.available}
            checked={inSearch}
            onChange={(e) => onInSearch(e.target.checked)}
          />{" "}
          Leads in this search
        </label>
      </div>
      <label className="notice" data-testid="leads-permit-filter-note">
        <select disabled aria-label="Permit status filter">
          <option>permit status</option>
        </select>{" "}
        Leads filter by status and by this search (radius and roof age), not by
        permit status or open duration: open a lead to see its parcel&apos;s
        permits.
      </label>
      {inSearch && search.checking !== undefined && (
        <p className="notice" data-testid="leads-checking">
          checking {search.checking.toLocaleString("en-US")} leads…
        </p>
      )}
      {inSearch && search.error && (
        <p className="error" data-testid="leads-search-error">
          {search.error}
        </p>
      )}
      {capped && (
        <p className="notice" data-testid="leads-cap-notice">
          Showing the first{" "}
          {(LEADS_MAX_PAGES * LEADS_PAGE_SIZE).toLocaleString("en-US")} leads.
          More are stored; the count and the filters cover only these.
        </p>
      )}
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
