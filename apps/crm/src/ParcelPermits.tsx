import { useEffect, useState } from "react";
import {
  isLongOpen,
  joinLabel,
  openDuration,
  roofingTag,
  statusClassLabel,
  type OpenWindow,
} from "./permitDisplay.ts";
import type {
  ParcelPermit,
  ParcelPermits as Permits,
  PermitContractor,
  PermitsApi,
} from "./permitsApi.ts";

/**
 * The license class: the normalized class (license_class), with the type as printed on the permit
 * (source_license_type) in brackets when it differs, plus the class note (license_class_note) when set.
 */
const licenseClass = (c: PermitContractor) => {
  const base = c.license_class ?? c.source_license_type ?? "—";
  const printed =
    c.source_license_type && c.source_license_type !== base
      ? ` [${c.source_license_type}]`
      : "";
  return `${base}${printed}${c.license_class_note ? ` (${c.license_class_note})` : ""}`;
};

/**
 * The contractor's identity, one per license number (not verified against CSLB): the key, the canonical name
 * and how many names the license carries (counted, never listed). A license without a name on any of its
 * rows has no canonical name, and none is shown; a row without a license number has no identity.
 */
function Identity({ c }: { c: PermitContractor }) {
  if (c.contractor_identity_key === null) return null;
  const n = c.name_variant_count;
  return (
    <span
      data-testid="contractor-identity"
      data-key={c.contractor_identity_key}
    >
      {" · identity "}
      <span data-testid="contractor-identity-key">
        {c.contractor_identity_key}
      </span>
      {c.canonical_business_name !== null && (
        <>
          {" · canonical name "}
          <span data-testid="contractor-canonical-name">
            {c.canonical_business_name}
          </span>
        </>
      )}
      {n !== null && (
        <>
          {" · name variants "}
          <span data-testid="contractor-name-variants" data-count={n}>
            {n.toLocaleString("en-US")}
          </span>
        </>
      )}
    </span>
  );
}

function Contractor({ c }: { c: PermitContractor }) {
  const place = [c.city_name, c.state_code].filter(Boolean).join(", ");
  return (
    <li data-testid="contractor">
      <span data-testid="contractor-name">
        {c.contractors_business_name ?? "business name not published"}
      </span>
      {" · license "}
      <span data-testid="contractor-license">
        {c.license_identifier ?? "—"}
      </span>
      <Identity c={c} />
      {" · class "}
      <span data-testid="contractor-class">{licenseClass(c)}</span>
      {c.is_owner_builder && (
        <>
          {" · "}
          <span data-testid="contractor-owner-builder">owner-builder</span>
        </>
      )}
      {c.license_expiration_date && (
        <> · license expires {c.license_expiration_date}</>
      )}
      {place && <> · {place}</>}
    </li>
  );
}

function Permit({
  p,
  openWindow,
}: {
  p: ParcelPermit;
  openWindow: OpenWindow;
}) {
  const long = isLongOpen(p, openWindow);
  const roofing = roofingTag(p);
  return (
    <li
      className={long ? "permit long-open" : "permit"}
      data-testid="parcel-permit"
      data-permit={p.permit_number}
      data-long-open={String(long)}
      data-roofing={String(p.roofing_work)}
    >
      <b data-testid="permit-number">{p.permit_number}</b>{" "}
      {long && <span className="tag">long-open</span>}{" "}
      {roofing && (
        <span className="tag" data-testid="permit-roofing">
          {roofing}
        </span>
      )}
      <dl>
        <dt>Status</dt>
        <dd>
          {p.source_status_desc ?? "status not published"} ·{" "}
          <span
            data-testid="permit-status-class"
            data-class={p.permit_status_class}
          >
            {statusClassLabel(p.permit_status_class)}
          </span>
        </dd>
        <dt>Open duration</dt>
        <dd data-field="open_days">
          {p.open_days === null ? "not open" : openDuration(p.open_days)}
        </dd>
        <dt>Issued</dt>
        <dd data-field="permit_issue_date">{p.permit_issue_date ?? "—"}</dd>
        <dt>Status date</dt>
        <dd data-field="status_date">{p.status_date ?? "—"}</dd>
        <dt>Join method</dt>
        <dd data-field="join_method">
          {joinLabel(p.join_method)}
          {p.building_level && (
            <>
              {" · "}
              <span data-testid="permit-building-level">
                building-level ({p.parcel_count} units)
              </span>
            </>
          )}
        </dd>
        <dt>Contractors</dt>
        <dd>
          {p.contractors.length === 0 ? (
            <span data-testid="contractor-not-published">
              Contractor not published
            </span>
          ) : (
            <ul className="contractors">
              {p.contractors.map((c, i) => (
                <Contractor key={i} c={c} />
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </li>
  );
}

/**
 * The "Permits" section of the parcel detail: one permits.forParcel call per opened parcel. Its errors stay
 * inside this section. A permit is highlighted as long-open with the same window as the long-open list.
 */
export function ParcelPermits({
  permits,
  parcelId,
  openWindow,
}: {
  permits: PermitsApi;
  parcelId: string;
  openWindow: OpenWindow;
}) {
  // Keyed by parcel, so "loading" is derived and state changes only happen in the async callbacks.
  const [got, setGot] = useState<{
    id: string;
    data?: Permits;
    error?: string;
  }>();
  useEffect(() => {
    let live = true;
    permits.forParcel({ parcel_id: parcelId }).then(
      (data) => live && setGot({ id: parcelId, data }),
      (e: Error) => live && setGot({ id: parcelId, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [permits, parcelId]);
  const mine = got?.id === parcelId ? got : undefined;
  const data = mine?.data;
  return (
    <section className="parcel-permits" data-testid="parcel-permits">
      <h4>Permits</h4>
      {!mine && <p className="notice">Loading permits…</p>}
      {mine?.error && (
        <p className="error" data-testid="parcel-permits-error">
          Permits unavailable: {mine.error}
        </p>
      )}
      {data &&
        data.permits.length === 0 &&
        (data.permit_data_available ? (
          <p className="notice" data-testid="no-permits">
            No permits on record for this parcel.
          </p>
        ) : (
          <p className="notice" data-testid="no-permit-data">
            No permit data: outside the City of Los Angeles (jurisdiction:{" "}
            {data.jurisdiction ?? "unknown"})
          </p>
        ))}
      {data && data.permits.length > 0 && (
        <ul className="list">
          {data.permits.map((p) => (
            <Permit key={p.permit_number} p={p} openWindow={openWindow} />
          ))}
        </ul>
      )}
      {data && (
        <dl>
          <dt>BBB rating</dt>
          {/* Never a rating: the API serves none, only the reason it is unavailable. */}
          <dd data-field="bbb_rating" data-testid="bbb-rating">
            not available ({data.bbb.reason})
          </dd>
        </dl>
      )}
    </section>
  );
}
