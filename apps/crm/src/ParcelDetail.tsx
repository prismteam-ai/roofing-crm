import type { ReactNode } from "react";
import type { ParcelDetail as Detail } from "@oracle-la/api-client";

const LABELS: Array<[string, string]> = [
  ["parcel_id", "Parcel (AIN)"],
  ["assessor_id", "Assessor ID"],
  ["address", "Address"],
  ["year_built", "Year built"],
  ["effective_year_built", "Effective year built"],
  ["roof_age_basis", "Roof-age basis"],
  ["effective_roof_year", "Effective roof year"],
  ["roof_year_permit_number", "Roof-year permit"],
  ["use_description", "Use"],
  ["latitude", "Latitude"],
  ["longitude", "Longitude"],
  ["coordinate_basis", "Coordinate basis"],
  ["jurisdiction", "Jurisdiction"],
  ["roll_year", "Roll year"],
  ["last_recording_date", "Last recorded document"],
  ["owner_unchanged_10y_proxy", "No recorded document in 10+ years (proxy)"],
];
/** Fields the assessor roll leaves empty for some parcels: shown as "not in source" rather than a dash. */
const NOT_IN_SOURCE = new Set(["year_built", "effective_year_built"]);
export function ParcelDetail({
  detail,
  onClose,
  children,
}: {
  detail: Detail;
  onClose: () => void;
  /** The parcel's lead editor, when the leads API is configured. */
  children?: ReactNode;
}) {
  const p = detail.property as Record<string, unknown>,
    v = detail.provenance as Record<string, unknown>;
  return (
    <div className="detail" data-testid="detail">
      <div className="row">
        <b style={{ flex: 1 }}>{String(p.address ?? p.parcel_id)}</b>
        <button onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <dl>
        {LABELS.map(([k, l]) => (
          <div key={k}>
            <dt>{l}</dt>
            <dd data-field={k}>
              {String(p[k] ?? (NOT_IN_SOURCE.has(k) ? "not in source" : "—"))}
            </dd>
          </div>
        ))}
      </dl>
      {children}
      <p className="notice">
        The recording date is the latest recorded document, not necessarily a
        sale. Roof age counts from the effective roof year: the later of the
        assessor year built and the year of the latest finaled roofing permit.
      </p>
      <h4>Source</h4>
      <dl>
        <dt>Source</dt>
        <dd data-field="source_name">{String(v.source_name)}</dd>
        <dt>Request URL</dt>
        <dd data-field="source_request_url">{String(v.source_request_url)}</dd>
        <dt>Retrieved at (UTC)</dt>
        <dd data-field="source_retrieved_at">
          {String(v.source_retrieved_at)}
        </dd>
        <dt>Page sha256</dt>
        <dd data-field="source_page_sha256">{String(v.source_page_sha256)}</dd>
      </dl>
    </div>
  );
}
