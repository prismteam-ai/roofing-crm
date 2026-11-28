import type { LeadFilter, LeadStatus } from "@crm/leads-db/schema";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { basisLabel, openFor } from "../../lib/format.ts";
import { useTRPC } from "../../lib/trpc.ts";
import { useSearch } from "../../state.tsx";
import { Filters, type FilterValue } from "../candidates/Filters.tsx";
import { clampRadius } from "../map/SearchControls.tsx";
import { LeadDetail } from "./LeadDetail.tsx";
import { STATUS_LABEL } from "./StatusControl.tsx";

const ALL_STATUSES = Object.keys(STATUS_LABEL) as LeadStatus[];

export function LeadsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { search } = useSearch();
  const [f, setF] = useState<FilterValue>({ minRoofAgeYears: 0, minOpenYears: 0, permitStatus: undefined });
  const [status, setStatus] = useState<LeadStatus[] | undefined>();
  const [nearOn, setNearOn] = useState(false);
  const [radius, setRadius] = useState(search.radiusMiles);
  const [text, setText] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filter = useMemo<LeadFilter>(
    () => ({
      ...(f.minRoofAgeYears ? { minRoofAgeYears: f.minRoofAgeYears } : {}),
      ...(f.minOpenYears ? { minOpenYears: f.minOpenYears } : {}),
      ...(f.permitStatus ? { permitStatus: f.permitStatus } : {}),
      ...(status ? { status } : {}),
      ...(text.trim() ? { search: text.trim() } : {}),
      ...(nearOn ? { near: { center: search.center, radiusMiles: radius } } : {}),
    }),
    [f, status, text, nearOn, radius, search.center],
  );
  const q = useQuery({ ...trpc.leads.list.queryOptions(filter), placeholderData: keepPreviousData });
  const reconcile = useMutation({
    ...trpc.leads.reconcile.mutationOptions(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.leads.list.pathKey() }),
  });
  const leads = q.data ?? [];

  return (
    <div className="leads-page">
      <header className="row">
        <h1>Leads</h1>
        <span className="muted" data-testid="lead-count">
          {leads.length} lead{leads.length === 1 ? "" : "s"}
        </span>
        <button type="button" onClick={() => reconcile.mutate()} disabled={reconcile.isPending}>
          Check against current data run
        </button>
        {reconcile.data ? (
          <span role="status" className="muted">
            Checked {reconcile.data.checked}, {reconcile.data.markedStale} newly stale.
          </span>
        ) : null}
      </header>
      <div className="lead-filters">
        <Filters value={f} onChange={(p) => setF((v) => ({ ...v, ...p }))} idPrefix="leads" />
        <fieldset>
          <legend>Lead</legend>
          <label>
            Search{" "}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="address, city or parcel"
            />
          </label>
          <span role="group" aria-label="Lead status" className="statuses">
            {ALL_STATUSES.map((s) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={!status || status.includes(s)}
                  onChange={() => {
                    const cur = status ?? ALL_STATUSES;
                    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
                    setStatus(next.length === ALL_STATUSES.length ? undefined : next.length ? next : cur);
                  }}
                />{" "}
                {STATUS_LABEL[s]}
              </label>
            ))}
          </span>
          <label>
            <input type="checkbox" checked={nearOn} onChange={(e) => setNearOn(e.target.checked)} /> Within{" "}
            <input
              type="number"
              aria-label="Lead radius in miles"
              min={0.25}
              max={25}
              step={0.25}
              value={radius}
              onChange={(e) => setRadius(clampRadius(Number(e.target.value)))}
            />{" "}
            mi of the map center (
            {search.placeName ?? `${search.center.lat.toFixed(3)}, ${search.center.lon.toFixed(3)}`})
          </label>
        </fieldset>
      </div>
      <table className="leads-table">
        <thead>
          <tr>
            <th>Address</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Roof age</th>
            <th>Permit</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              data-testid={`lead-${l.propertyId}`}
              className={l.id === openId ? "selected" : undefined}
            >
              <td>
                <button type="button" className="link" onClick={() => setOpenId(l.id)}>
                  {l.signals.address ?? `Parcel ${l.propertyId}`}
                </button>
                {l.stale ? (
                  <span className="badge stale" title={l.staleReason ?? undefined}>
                    stale
                  </span>
                ) : null}
              </td>
              <td>{STATUS_LABEL[l.status]}</td>
              <td>{l.priority}</td>
              <td>
                {l.signals.roofAgeYears ?? "—"}{" "}
                <span className="muted">
                  {l.signals.roofAgeYears !== null ? basisLabel(l.signals.roofAgeBasis) : ""}
                </span>
              </td>
              <td>
                {l.signals.permitStatuses.join(", ") || "—"}
                {l.signals.maxOpenDays !== null ? ` · ${openFor(l.signals.maxOpenDays)}` : ""}
              </td>
              <td>{l.createdAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!leads.length && !q.isLoading ? <p className="muted">No leads match these filters.</p> : null}
      {openId ? <LeadDetail id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
