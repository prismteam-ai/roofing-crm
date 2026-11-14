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
 * Leads, filtered at read time: by status, by "Leads in this search" (the parcels of the current radius,
 * roof-age and ownership result) and by "Has a long-open roofing permit" (the map's open-duration window).
 * The data API answers both of the last two through parcels.match (see leadsInSearch.ts); the long-open
 * toggle works with "Leads in this search" on (the search filter and the lead IDs) and off (the lead IDs
 * only). Nothing derived is stored with a lead, which holds the parcel only. There is no filter on other
 * permit statuses; the disabled control says so.
 */
export function LeadsList({
  leads,
  search,
  inSearch,
  onInSearch,
  longOpen,
  onLongOpen,
  windowText,
  error,
  capped,
  onOpen,
}: {
  leads: Lead[];
  /** Which leads pass the filters that ask the data API ("Leads in this search", the long-open toggle). */
  search: LeadsInSearch;
  /** The "Leads in this search" filter is on (kept by the app, which only checks leads while it is on). */
  inSearch: boolean;
  onInSearch: (on: boolean) => void;
  /** The "Has a long-open roofing permit" toggle is on. */
  longOpen: boolean;
  onLongOpen: (on: boolean) => void;
  /** The map's open-duration window in words ("open at least 1,826 days"); undefined while it is invalid. */
  windowText?: string;
  error?: string;
  /** More leads are stored than the list loaded (the page limit was reached with a next cursor left). */
  capped?: boolean;
  onOpen: (parcelId: string) => void;
}) {
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const searchIds = search.ids;
  const asked = inSearch || longOpen;
  // With a filter on, nothing is listed until the answer is complete (never a partial result).
  const shown = useMemo(
    () =>
      leads
        .filter((l) => status === "all" || l.status === status)
        .filter((l) => !asked || !!searchIds?.has(l.parcel_id))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [leads, status, asked, searchIds],
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
      <label data-testid="leads-long-open-label">
        <input
          type="checkbox"
          data-testid="leads-long-open"
          checked={longOpen}
          onChange={(e) => onLongOpen(e.target.checked)}
        />{" "}
        Has a long-open roofing permit
        {windowText && (
          <span data-testid="leads-long-open-window"> ({windowText})</span>
        )}
      </label>
      <label className="notice" data-testid="leads-permit-filter-note">
        <select disabled aria-label="Permit status filter">
          <option>permit status</option>
        </select>{" "}
        Leads filter by status, by this search (radius, roof age and ownership)
        and by a long-open roofing permit in the map&apos;s open-duration
        window, which the data API checks; not by other permit statuses: open a
        lead to see its parcel&apos;s permits.
      </label>
      {longOpen && search.windowInvalid && (
        <p className="notice" data-testid="leads-window-invalid">
          The open-duration window is invalid: set a maximum not below the
          minimum.
        </p>
      )}
      {asked && search.checking !== undefined && (
        <p className="notice" data-testid="leads-checking">
          checking {search.checking.toLocaleString("en-US")} leads…
        </p>
      )}
      {asked && search.error && (
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
