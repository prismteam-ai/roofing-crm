import { useMemo, useState } from "react";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@roofing-crm/leads-client";
import { dateOnly } from "./dates.ts";
import { useLeadAddresses, type AddressLookup } from "./leadAddresses.ts";
import type { LeadsInSearch } from "./leadsInSearch.ts";

/** The list reads at most this many pages of this many leads. */
export const LEADS_PAGE_SIZE = 100;
export const LEADS_MAX_PAGES = 20;
/** Shown while there is no lead. */
export const NO_LEADS_TEXT =
  "No leads yet. To create one, open a parcel (a point on the map, a result or a long-open permit) and click Create lead in its panel.";

/**
 * Leads, filtered at read time: by status, by "Leads in this search" (the parcels of the current radius,
 * roof-age and ownership result) and by "Has a long-open roofing permit" (the map's open-duration window).
 * The data API answers both of the last two through parcels.match (see leadsInSearch.ts); the long-open
 * toggle works with "Leads in this search" on (the search filter and the lead IDs) and off (the lead IDs
 * only). Nothing derived is stored with a lead, which holds the parcel only. There is no filter on other
 * permit statuses; the disabled control says it is not available yet. The Parcel column adds the parcel's
 * address once the open list has looked it up (leadAddresses.ts). The Permit column is the permit a lead was
 * created from (a permit row), "—" for a lead created any other way.
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
  loaded,
  lookupAddress,
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
  /** The leads were read (an empty list then says how to create a lead). */
  loaded?: boolean;
  /** Reads a parcel's address for the open list (parcels.detail); kept in memory only, never in a lead. */
  lookupAddress?: AddressLookup;
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
  const [listOpen, setListOpen] = useState(false);
  const shownIds = useMemo(() => shown.map((l) => l.parcel_id), [shown]);
  const addresses = useLeadAddresses(lookupAddress, shownIds, listOpen);
  return (
    <section className="leads" data-testid="leads">
      <h3>Leads</h3>
      <label data-testid="leads-status-filter-label">
        Status{" "}
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
      </label>
      <label
        data-testid="leads-in-search-label"
        className={search.available ? undefined : "unavailable"}
      >
        <input
          type="checkbox"
          data-testid="leads-in-search"
          disabled={!search.available}
          checked={inSearch}
          onChange={(e) => onInSearch(e.target.checked)}
        />{" "}
        Leads in this search
        {!search.available && (
          <span data-testid="leads-in-search-needs-pin">
            {" "}
            (needs a pin on the map first)
          </span>
        )}
      </label>
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
      <label className="unavailable" data-testid="leads-permit-filter">
        <select disabled aria-label="Permit status filter">
          <option>permit status</option>
        </select>{" "}
        not available yet
      </label>
      <details className="rule-details" data-testid="leads-filters-help">
        <summary>How the filters work</summary>
        <p className="rule" data-testid="leads-permit-filter-note">
          Leads filter by status, by this search (radius, roof age and
          ownership) and by a long-open roofing permit in the map&apos;s
          open-duration window, which the data API checks; not by other permit
          statuses: open a lead to see its parcel&apos;s permits.
        </p>
      </details>
      {longOpen && search.windowInvalid && (
        <p className="notice" data-testid="leads-window-invalid">
          The open-duration window is invalid: correct the years under Long-open
          roofing permits.
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
      {loaded && !error && leads.length === 0 && (
        <p className="notice" data-testid="leads-empty">
          {NO_LEADS_TEXT}
        </p>
      )}
      <details
        className="list-details"
        data-testid="leads-details"
        onToggle={(e) => setListOpen(e.currentTarget.open)}
      >
        <summary>
          Leads list{" "}
          <span className="notice">
            <span data-testid="leads-count">{shown.length}</span> /{" "}
            {leads.length}
          </span>
        </summary>
        <table className="leads-table">
          <thead>
            <tr>
              <th>Parcel</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Permit</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr
                key={l.parcel_id}
                data-testid="lead-item"
                data-parcel={l.parcel_id}
                onClick={() => onOpen(l.parcel_id)}
              >
                <td>
                  <span className="mono" data-testid="lead-parcel">
                    {l.parcel_id}
                  </span>
                  {addresses.get(l.parcel_id) && (
                    <span className="lead-address" data-testid="lead-address">
                      {addresses.get(l.parcel_id)}
                    </span>
                  )}
                </td>
                <td>{l.status}</td>
                <td className="nowrap">{dateOnly(l.updated_at)}</td>
                <td className="mono" data-testid="lead-permit">
                  {l.source_permit ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
