import { useEffect, useState } from "react";
import {
  isLongOpen,
  joinLabel,
  openDuration,
  statusClassLabel,
  type OpenWindow,
} from "./permitDisplay.ts";
import type {
  ParcelPermit,
  ParcelPermits as Permits,
  PermitContractor,
  PermitsApi,
} from "./permitsApi.ts";

/** "R [raw]" when the raw class differs from the normalized one, plus the class note when set. */
const licenceClass = (c: PermitContractor) => {
  const base = c.licence_class ?? c.licence_class_raw ?? "—";
  const raw =
    c.licence_class_raw && c.licence_class_raw !== base
      ? ` [${c.licence_class_raw}]`
      : "";
  return `${base}${raw}${c.class_note ? ` (${c.class_note})` : ""}`;
};

function Contractor({ c }: { c: PermitContractor }) {
  const place = [c.contractor_city, c.contractor_state]
    .filter(Boolean)
    .join(", ");
  return (
    <li data-testid="contractor">
      <span data-testid="contractor-name">
        {c.business_name ?? "business name not published"}
      </span>
      {" · licence "}
      <span data-testid="contractor-licence">{c.licence_number ?? "—"}</span>
      {" · class "}
      <span data-testid="contractor-class">{licenceClass(c)}</span>
      {c.owner_builder && (
        <>
          {" · "}
          <span data-testid="contractor-owner-builder">owner-builder</span>
        </>
      )}
      {c.licence_expiration_date && (
        <> · licence expires {c.licence_expiration_date}</>
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
  return (
    <li
      className={long ? "permit long-open" : "permit"}
      data-testid="parcel-permit"
      data-permit={p.permit_nbr}
      data-long-open={String(long)}
    >
      <b data-testid="permit-number">{p.permit_nbr}</b>{" "}
      {long && <span className="tag">long-open</span>}
      <dl>
        <dt>Status</dt>
        <dd>
          {p.status} ·{" "}
          <span data-testid="permit-status-class" data-class={p.status_class}>
            {statusClassLabel(p.status_class)}
          </span>
        </dd>
        <dt>Open duration</dt>
        <dd data-field="open_days">
          {p.open_days === null ? "not open" : openDuration(p.open_days)}
        </dd>
        <dt>Issued</dt>
        <dd data-field="issue_date">{p.issue_date ?? "—"}</dd>
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
            <Permit key={p.permit_nbr} p={p} openWindow={openWindow} />
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
