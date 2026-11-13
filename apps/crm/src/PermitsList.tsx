import { useEffect, useMemo, useState } from "react";
import type { LatLon } from "@roofing-crm/geo";
import {
  joinLabel,
  openDuration,
  roofingTag,
  statusClassLabel,
  wholeYears,
  windowInvalid,
  yearsAndDays,
  yearsToDays,
  type OpenWindow,
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
 * Long-open permits around the pin, combined with the radius and the roof-age threshold. Only open-issued
 * permits count as open (the server decides). The API returns every long-open LADBS permit, roofing work or
 * not; each row shows its roofing flag. Like the parcel search, the inputs are debounced as one stable string
 * key (250 ms): one call per input change.
 *
 * The API also serves each item's parcel ID and, in parcels.points, a long-open column; this list does not
 * use them yet (rows do not open a parcel, and the map does not highlight long-open parcels).
 */
export function PermitsList({
  permits,
  center,
  radius,
  threshold,
  openWindow: w,
  onWindow,
}: {
  permits: PermitsApi;
  /** The pin; nothing is shown or asked until there is one. */
  center?: LatLon;
  radius: number;
  threshold: number;
  openWindow: OpenWindow;
  onWindow: (w: OpenWindow) => void;
}) {
  const [sort, setSort] = useState<Sort>("open_days");
  const invalid = windowInvalid(w);
  const minDays = yearsToDays(w.minYears);
  const maxDays =
    w.maxYears === undefined ? undefined : yearsToDays(w.maxYears);
  // Key: pin (6 decimals, as the parcel search), radius, threshold, min days, max days ("" = unset), sort.
  const key = useDebounced(
    center && !invalid
      ? `${center.lat.toFixed(6)},${center.lon.toFixed(6)}|${radius}|${threshold}|${minDays}|${maxDays ?? ""}|${sort}`
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
      <h3>Long-open permits</h3>
      <div className="row">
        <label htmlFor="permits-min">Open at least (years)</label>
        <input
          id="permits-min"
          data-testid="permits-min-years"
          type="number"
          min={1}
          step={1}
          value={w.minYears}
          onChange={(e) =>
            onWindow({ ...w, minYears: wholeYears(e.target.value) })
          }
        />
      </div>
      <div className="row">
        <label htmlFor="permits-max">At most (years, optional)</label>
        <input
          id="permits-max"
          data-testid="permits-max-years"
          type="number"
          min={1}
          step={1}
          placeholder="no maximum"
          value={w.maxYears ?? ""}
          onChange={(e) =>
            onWindow({
              ...w,
              maxYears:
                e.target.value === "" ? undefined : wholeYears(e.target.value),
            })
          }
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
      {invalid && (
        <p className="error" data-testid="permits-window-error">
          The maximum ({w.maxYears} years) is below the minimum ({w.minYears}{" "}
          years); set a larger maximum or clear it.
        </p>
      )}
      <p className="rule" data-testid="permits-rule">
        Only permits with status class Open (issued) count as open. Long-open:
        open at least {yearsAndDays(w.minYears)}
        {w.maxYears !== undefined && (
          <> and at most {yearsAndDays(w.maxYears)}</>
        )}
        , within {radius} miles of the pin, on parcels whose roof is older than{" "}
        {threshold} years. Days = years × 365.25, rounded.
        {data?.rule.text && (
          <>
            {" "}
            <span data-testid="permits-api-rule">{data.rule.text}</span>
          </>
        )}
      </p>
      {error && (
        <p className="error" data-testid="permits-error">
          Permits unavailable: {error}
        </p>
      )}
      {loading && <p className="notice">Searching permits…</p>}
      {data && (
        <>
          <div className="row">
            <span
              className="notice"
              data-testid="permits-count"
              data-count={data.count}
            >
              {data.count.toLocaleString("en-US")} long-open permits · showing{" "}
              {data.items.length ? offset + 1 : 0}–{offset + data.items.length}
            </span>
            <button
              data-testid="permits-prev"
              disabled={offset === 0}
              onClick={() => void page(Math.max(0, offset - PERMITS_PAGE_SIZE))}
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
          <ul className="list">
            {data.items.map((p) => {
              const roofing = roofingTag(p);
              return (
                <li
                  key={p.permit_number}
                  className="permit long-open"
                  data-testid="permit-row"
                  data-permit={p.permit_number}
                  data-open-days={p.open_days ?? undefined}
                  data-distance={p.distance_miles}
                  data-roofing={String(p.roofing_work)}
                >
                  <b>{p.permit_number}</b>{" "}
                  <span className="tag">long-open</span>
                  {roofing && (
                    <>
                      {" "}
                      <span className="tag" data-testid="permit-roofing">
                        {roofing}
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
                  issued {p.permit_issue_date ?? "—"} · {p.distance_miles} mi ·
                  join {joinLabel(p.join_method)}
                  {p.building_level &&
                    ` · building-level (${p.parcel_count} units)`}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
