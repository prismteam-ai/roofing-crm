import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { basisLabel, openFor, shortCid } from "../../lib/format.ts";
import { useTRPC } from "../../lib/trpc.ts";
import { useSearch } from "../../state.tsx";
import { Notes } from "./Notes.tsx";
import { StatusControl } from "./StatusControl.tsx";

export function LeadDetail({ id, onClose }: { id: string; onClose(): void }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { setCenter, setAgentResults } = useSearch();
  const q = useQuery(trpc.leads.get.queryOptions({ id }));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: trpc.leads.get.queryKey({ id }) });
    void qc.invalidateQueries({ queryKey: trpc.leads.list.pathKey() });
  };
  const status = useMutation({ ...trpc.leads.updateStatus.mutationOptions(), onSuccess: refresh });
  const note = useMutation({ ...trpc.leads.addNote.mutationOptions(), onSuccess: refresh });
  const l = q.data;
  if (!l) return <aside className="drawer">{q.error ? q.error.message : "Loading lead…"}</aside>;
  const s = l.signals;

  function showOnMap() {
    setCenter({ lat: s.lat, lon: s.lon }, "coords", s.address);
    setAgentResults([
      { propertyId: l!.propertyId, lat: s.lat, lon: s.lon, label: s.address ?? l!.propertyId },
    ]);
    window.location.hash = "#/map";
  }

  return (
    <aside className="drawer" role="dialog" aria-label="Lead detail">
      <button type="button" className="close" onClick={onClose} aria-label="Close lead">
        ×
      </button>
      <h2>{s.address ?? `Parcel ${l.propertyId}`}</h2>
      <p className="muted">
        {s.city ?? ""} · parcel {l.propertyId} · priority {l.priority}
      </p>
      {l.stale ? (
        <p className="badge stale" role="status">
          Stale: {l.staleReason ?? "the property changed in a newer data run"}
        </p>
      ) : null}
      <StatusControl
        status={l.status}
        disabled={status.isPending}
        onChange={(to) => status.mutate({ id, status: to })}
      />
      {status.error ? <p className="notice">{status.error.message}</p> : null}
      <dl className="facts-grid">
        <dt>Roof age</dt>
        <dd>
          {s.roofAgeYears ?? "unknown"} {s.roofAgeYears !== null ? "years" : ""}{" "}
          <span className="muted">({basisLabel(s.roofAgeBasis)})</span>
        </dd>
        <dt>Roofing permit</dt>
        <dd>
          {l.permitId ?? "—"} {s.maxOpenDays !== null ? `· ${openFor(s.maxOpenDays)}` : ""}{" "}
          {s.permitStatuses.length ? `(${s.permitStatuses.join(", ")})` : ""}
        </dd>
        <dt>Owner location</dt>
        <dd>{s.ownerLocationClass.replaceAll("_", " ")}</dd>
        <dt>From run</dt>
        <dd>
          <code title={l.sourceManifestCid}>{shortCid(l.sourceManifestCid)}</code>
        </dd>
      </dl>
      <div className="row">
        <button type="button" onClick={showOnMap}>
          Show on map
        </button>
        <span title="Outreach coming soon">
          <button type="button" disabled aria-disabled="true" title="Outreach coming soon">
            Contact
          </button>
        </span>
      </div>
      <Notes
        notes={l.notes}
        events={l.events}
        pending={note.isPending}
        onAdd={(body) => note.mutate({ id, body })}
      />
    </aside>
  );
}
