import { declaredSynthetic } from "./useCrmController";
import { type Lead } from "../../../packages/contracts/src/index";
import {
  propertyEvidence,
  isRestrictedProviderCitation,
} from "../../../packages/map-domain/src/signals";
import { RecordedDeedEvidence } from "./RecordedDeedEvidence";
import { OwnerObservations } from "./OwnerObservations";
import { OfficialParcelObservation } from "./OfficialParcelObservation";
import { PermitEvidence } from "./PermitEvidence";
import { ReportContext } from "./ReportContext";
import "./style.css";
import type { CrmController } from "./useCrmController";
export function PropertyDrawer({ controller }: { controller: CrmController }) {
  const {
    query,
    ready,
    selectedSnapshot,
    selected,
    note,
    leadMutationBusy,
    noteDraft,
    changeNote,
    sid,
    closeDetail,
    detailRef,
    createLead,
    updateLead,
    selectedLead,
    age,
    basis,
    knownOpenPermits,
  } = controller;
  return ready && selected ? (
    <aside
      ref={detailRef}
      role="dialog"
      aria-modal="false"
      className="detail-drawer"
      data-testid="property-detail"
      aria-label="Property detail"
    >
      <div className="detail-top">
        <span className="eyebrow">PROPERTY EVIDENCE</span>
        <button
          className="close-button"
          aria-label="Close property detail"
          onClick={closeDetail}
        >
          ×
        </button>
      </div>
      <span className={`usage ${selected.usage}`}>{selected.usage}</span>
      <h2>{selected.address}</h2>
      <p className="detail-id">
        {selected.id} · {selected.nativeId} · {selectedSnapshot}
      </p>
      <div className="detail-main-signal">
        <span>Estimated roof age</span>
        <strong>{age(selected)}</strong>
        <span className={`confidence ${selected.roof.confidence}`}>
          {selected.roof.confidence} confidence
        </span>
      </div>
      <p className="basis">
        {basis(selected)} · as of {selected.roof.asOf}
      </p>
      <p className="caveat">
        {selected.roof.caveats.join(" ") ||
          "Evidence anchor is not a physical roof inspection."}
      </p>
      <h3 className="section-label">PERMITS & CONTRACTORS</h3>
      <p className="caveat" data-testid="permit-evidence-summary">
        Known open permits:{" "}
        <strong>{knownOpenPermits(selected) ?? "Unknown / not sourced"}</strong>
        .{" "}
        {knownOpenPermits(selected) === null
          ? "No permit records were acquired for this property. This does not prove permit absence."
          : declaredSynthetic(selected)
            ? "Declared synthetic fixture records."
            : "Counts cover acquired roofing records only; missing coverage remains unknown."}
      </p>
      {selected.permits.map((p) => (
        <PermitEvidence
          key={p.id}
          permit={p}
          asOf={selected.roof.asOf}
          synthetic={declaredSynthetic(selected)}
        />
      ))}
      <h3 className="section-label">OWNERSHIP & IDENTITY</h3>
      <OfficialParcelObservation
        observation={selected.ownership.officialParcelObservation}
      />
      <RecordedDeedEvidence
        observations={selected.ownership.recordedTransferIndexObservations}
        minimumYears={query.minRecordedDeedGapYears}
      />
      <OwnerObservations
        observations={selected.ownership.reportedOwnerObservations}
      />
      <p className="caveat">
        Transfer: {selected.ownership.lastTransferDate ?? "unavailable"} ·
        historical coverage {selected.ownership.historyCoverage}. Selected
        location evidence: {selected.ownership.ownerRegion.replaceAll("_", " ")}
        . Phone and email are unavailable in the current source observations.
      </p>
      {selected.ownership.events && selected.ownership.events.length > 0 && (
        <>
          <h3 className="section-label">REPORTED OWNERSHIP EVENTS · PARTIAL</h3>
          {selected.ownership.events.map((event) => (
            <p className="caveat" key={event.id}>
              {event.kind.replaceAll("_", " ")} · {event.date} · {event.id}
            </p>
          ))}
          <p className="caveat">
            A source-reported sale event is a partial observation. It does not
            establish current ownership tenure or complete transfer history.
          </p>
        </>
      )}
      <p className="caveat">
        {selected.parcelIds.length} parcel association(s) ·{" "}
        {selected.coordinates
          ? "Source position available"
          : "No geometry available"}
      </p>
      {selected.siteAddresses && (
        <>
          <h3 className="section-label">SITE ADDRESSES</h3>
          <p className="caveat">
            {selected.siteAddressCount ?? selected.siteAddresses.length} source
            address records · coordinate basis{" "}
            {selected.coordinateBasis?.replaceAll("_", " ") ?? "unknown"}
            {selected.siteAddressesTruncated ? " · display truncated" : ""}
          </p>
          {selected.siteAddresses.map((a) => (
            <p className="caveat" key={a.id}>
              {a.address} · {a.city ?? "city unavailable"} · {a.id}
            </p>
          ))}
        </>
      )}
      <p className="caveat">
        Ownership evidence: {selected.ownership.evidenceClass ?? "unknown"} ·
        location class{" "}
        {selected.ownership.locationClass?.replaceAll("_", " ") ?? "unknown"}.
        Missing transfer dates do not establish tenure.
      </p>
      <h3 className="section-label">SOURCE CITATIONS</h3>
      {propertyEvidence(selected).map((p) => (
        <div
          className="citation"
          key={`${p.sourceId}:${p.recordId}:${p.digest}`}
          data-private-evidence={
            isRestrictedProviderCitation(selected, p)
              ? "provider-source-citation"
              : undefined
          }
        >
          <b>{p.sourceId}</b>
          {p.sourceId.startsWith("official-") &&
            p.sourceId.endsWith("-sales-pdf") && (
              <ReportContext
                key={`${sid}:${selected.id}:${p.recordId}`}
                sourceId={p.sourceId}
                snapshotId={query.snapshotId}
                recordId={p.recordId}
              />
            )}
          <span>
            {p.recordId} · {p.kind}
          </span>
          <small>
            Observed {p.observedAt.slice(0, 10)} · digest{" "}
            {p.digest.slice(0, 12)}…
          </small>
        </div>
      ))}
      <div className="lead-actions" aria-busy={leadMutationBusy}>
        {selectedLead ? (
          <>
            <div className="saved-label">
              ✓ Saved as a lead · version {selectedLead.version}
            </div>
            <label>
              Lead status
              <select
                aria-label="Lead status"
                disabled={leadMutationBusy}
                value={selectedLead.status}
                onChange={(e) =>
                  void updateLead(selectedLead, {
                    status: e.target.value as Lead["status"],
                  })
                }
              >
                <option value="new">New</option>
                <option value="qualified">Qualified</option>
                <option value="contacted">Contacted (record only)</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label>
              Lead note
              <textarea
                aria-label="Lead note"
                value={note}
                onChange={(e) => changeNote(e.target.value)}
                placeholder="Add a local qualification note"
                maxLength={2000}
              />
            </label>
            <button
              className="button secondary"
              disabled={leadMutationBusy || !note.trim()}
              onClick={() =>
                void updateLead(selectedLead, {
                  note: noteDraft.current.value,
                })
              }
            >
              Save note
            </button>
            <details>
              <summary>Lead history ({selectedLead.events.length})</summary>
              {selectedLead.events.map((e, i) => (
                <p className="history-event" key={i}>
                  {e.kind} · {e.at.slice(0, 19)}
                  {e.note ? ` — ${e.note}` : ""}
                </p>
              ))}
            </details>
          </>
        ) : (
          <button
            className="button primary"
            disabled={leadMutationBusy}
            onClick={() => void createLead(selected)}
          >
            Create lead <span>+</span>
          </button>
        )}
        <small>Local record only. No message or outreach is sent.</small>
      </div>
    </aside>
  ) : null;
}
