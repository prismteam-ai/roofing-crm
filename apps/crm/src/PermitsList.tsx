import { useEffect, useMemo, useState } from "react";
import type { LatLon } from "@roofing-crm/geo";
import { inputValue, typed } from "./numeric.ts";
import { coordText } from "./pin.ts";
import {
  joinLabel,
  longOpenTag,
  MAX_YEARS,
  openDuration,
  statusClassLabel,
  windowKey,
  yearsAndDays,
  type OpenWindow,
  type WindowText,
} from "./permitDisplay.ts";
import type {
  LongOpenInput,
  LongOpenResult,
  PermitsApi,
} from "./permitsApi.ts";
import { useDebounced } from "./useDebounced.ts";

/** Page size of the long-open list. */
export const PERMITS_PAGE_SIZE = 50;
type Sort = NonNullable<LongOpenInput["sort"]>;

/** The query a debounced key stands for (offset and limit are added per call). */
const parseKey = (key: string): Omit<LongOpenInput, "offset" | "limit"> => {
  const [ll, r, t, min, max, sort] = key.split("|");
  const [lat, lon] = ll!.split(",").map(Number);
  return {
    lat: lat!,
    lon: lon!,
    radius_miles: Number(r),
    threshold_years: Number(t),
    min_open_days: Number(min),
    // The maximum is sent only when the user set one (no key at all otherwise).
    ...(max ? { max_open_days: Number(max) } : {}),
    sort: sort as Sort,
  };
};

/**
 * Long-open roofing permits around the pin, combined with the radius and the roof-age threshold. The server
 * decides: only roofing work counts, and only open-issued permits count as open. A row is tagged only when it
 * stands apart (roof coating only). Like the parcel search, the inputs are debounced as one stable string key
 * (250 ms): one call per input change. A row opens its parcel's detail (the item's parcel_id; for a
 * building-level permit, its nearest unit). The map highlights the same window's parcels (App, parcels.points).
 */
export function PermitsList({
  permits,
  center,
  radius,
  threshold,
  windowText,
  onWindowText,
  openWindow: w,
  windowError,
  onOpen,
}: {
  permits: PermitsApi;
  /** The pin; nothing is shown or asked until there is one. */
  center?: LatLon;
  radius: number;
  threshold: number;
  /** The window's fields as typed. */
  windowText: WindowText;
  onWindowText: (t: WindowText) => void;
  /** The window read from them; undefined while a field is empty or invalid (windowError says why). */
  openWindow: OpenWindow | undefined;
  windowError: string | undefined;
  /** Opens a parcel's detail (the same panel as a map click). */
  onOpen: (parcelId: string) => void;
}) {
  const [sort, setSort] = useState<Sort>("open_days");
  // Key: pin (5 decimals, as the parcel search), radius, threshold, min days, max days ("" = unset), sort.
  // The days are windowKey's, the same the map highlight sends.
  const key = useDebounced(
    center && w
      ? `${coordText(center.lat)},${coordText(center.lon)}|${radius}|${threshold}|${windowKey(w)}|${sort}`
      : "",
    250,
  );
  const q = useMemo(() => (key ? parseKey(key) : undefined), [key]);
  const [result, setResult] = useState<{
    key: string;
    offset: number;
    data: LongOpenResult;
  }>();
  const [failed, setFailed] = useState<{ key: string; message: string }>();

  // A new key re-queries from offset 0. State changes happen only in the async callbacks.
  useEffect(() => {
    if (!q) return;
    let live = true;
    permits.longOpen({ ...q, offset: 0, limit: PERMITS_PAGE_SIZE }).then(
      (data) => {
        if (!live) return;
        setResult({ key, offset: 0, data });
        setFailed(undefined);
      },
      (e: Error) => live && setFailed({ key, message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [permits, q, key]);

  const page = async (offset: number) => {
    if (!q) return;
    try {
      const data = await permits.longOpen({
        ...q,
        offset,
        limit: PERMITS_PAGE_SIZE,
      });
      setResult({ key, offset, data });
      setFailed(undefined);
    } catch (e) {
      setFailed({ key, message: (e as Error).message });
    }
  };

  if (!center) return null;
  const shown = result?.key === key && key ? result : undefined;
  const loading = !!key && !shown && failed?.key !== key;
  const error = key && failed?.key === key ? failed.message : undefined;
  const data = shown?.data;
  const offset = shown?.offset ?? 0;
  return (
    <section className="permits" data-testid="permits-list">
      <h3 data-testid="permits-heading">Long-open roofing permits</h3>
      <div className="row">
        <label htmlFor="permits-min">Open at least (years)</label>
        <input
          id="permits-min"
          data-testid="permits-min-years"
          type="number"
          min={1}
          max={MAX_YEARS}
          step={1}
          value={inputValue(windowText.minYears)}
          onChange={(e) => onWindowText({ ...windowText, minYears: typed(e) })}
        />
      </div>
      <div className="row">
        <label htmlFor="permits-max">At most (years, optional)</label>
        <input
          id="permits-max"
          data-testid="permits-max-years"
          type="number"
          min={1}
          max={MAX_YEARS}
          step={1}
          placeholder="no maximum"
          value={inputValue(windowText.maxYears)}
          onChange={(e) => onWindowText({ ...windowText, maxYears: typed(e) })}
        />
      </div>
      <div className="row">
        <label htmlFor="permits-sort">Sort</label>
        <select
          id="permits-sort"
          data-testid="permits-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="open_days">Longest open first</option>
          <option value="distance">Nearest first</option>
        </select>
      </div>
      {windowError && (
        <p className="error" data-testid="permits-window-error" role="alert">
          {windowError}
        </p>
      )}
      <details className="rule-details" data-testid="permits-rule-details">
        <summary>Long-open rule</summary>
        <p className="rule" data-testid="permits-rule">
          Only permits with status class Open (issued) count as open. Roofing
          work only: a permit that is not roofing work never counts; a
          roof-coating-only permit counts and is tagged. Long-open:{" "}
          {w ? (
            <>
              open at least {yearsAndDays(w.minYears)}
              {w.maxYears !== undefined && (
                <> and at most {yearsAndDays(w.maxYears)}</>
              )}
            </>
          ) : (
            "in the open-duration window above, once it is valid"
          )}
          , within {radius} miles of the pin, on parcels whose roof is older
          than {threshold} years. Days = years × 365.25, rounded.
          {data?.rule.text && (
            <>
              {" "}
              <span data-testid="permits-api-rule">{data.rule.text}</span>
            </>
          )}
        </p>
      </details>
      {error && (
        <p className="error" data-testid="permits-error">
          Permits unavailable: {error}
        </p>
      )}
      {loading && <p className="notice">Searching permits…</p>}
      {/* Mounted while there is a pin, so an opened list stays open through new searches. */}
      <details className="list-details" data-testid="permits-details">
        <summary>
          Permits{" "}
          {data && (
            <span
              className="notice"
              data-testid="permits-count"
              data-count={data.count}
            >
              {data.count.toLocaleString("en-US")} long-open permits · showing{" "}
              {data.items.length ? offset + 1 : 0}–{offset + data.items.length}
            </span>
          )}
        </summary>
        {data && (
          <>
            <div className="row">
              <button
                data-testid="permits-prev"
                disabled={offset === 0}
                onClick={() =>
                  void page(Math.max(0, offset - PERMITS_PAGE_SIZE))
                }
              >
                Prev
              </button>
              <button
                data-testid="permits-next"
                disabled={data.next_offset === null}
                onClick={() => void page(data.next_offset!)}
              >
                Next
              </button>
            </div>
            {data.items.length > 0 && (
              <p className="notice" data-testid="permits-open-hint">
                Click a permit to open its parcel; a building-level permit opens
                its nearest unit.
              </p>
            )}
            <ul className="list">
              {data.items.map((p) => {
                const tag = longOpenTag(p);
                return (
                  <li
                    key={p.permit_number}
                    className="permit long-open"
                    data-testid="permit-row"
                    data-permit={p.permit_number}
                    data-parcel={p.parcel_id}
                    data-open-days={p.open_days ?? undefined}
                    data-distance={p.distance_miles}
                    data-roofing={String(p.roofing_work)}
                    title={
                      p.building_level
                        ? "Open the parcel's details (the nearest unit of this building)"
                        : "Open the parcel's details"
                    }
                    onClick={() => onOpen(p.parcel_id)}
                  >
                    <b>{p.permit_number}</b>{" "}
                    <span className="tag">long-open</span>
                    {tag && (
                      <>
                        {" "}
                        <span className="tag" data-testid="permit-roofing">
                          {tag}
                        </span>
                      </>
                    )}
                    <br />
                    {p.address ?? "address not published"}
                    <br />
                    {p.source_status_desc ?? "status not published"} ·{" "}
                    {statusClassLabel(p.permit_status_class)} · open{" "}
                    {p.open_days === null ? "—" : openDuration(p.open_days)}
                    <br />
                    issued {p.permit_issue_date ?? "—"} · {p.distance_miles} mi
                    · join {joinLabel(p.join_method)}
                    {p.building_level &&
                      ` · building-level (${p.parcel_count} units)`}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </details>
    </section>
  );
}
