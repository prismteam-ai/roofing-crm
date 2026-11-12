import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createApiClient,
  type ApiClient,
  type ParcelDetail as Detail,
  type PointsResult,
  type SearchResult,
} from "@oracle-la/api-client";
import {
  createLeadsClient,
  type Lead,
  type LeadsClient,
  type LeadStatus,
} from "@roofing-crm/leads-client";
import {
  circleRing,
  haversineMiles,
  LA_COUNTY_BOUNDS,
  type LatLon,
} from "@roofing-crm/geo";
import { mapStyleUrl } from "./basemap.ts";
import { loadConfig } from "./config.ts";
import { FuturePlaceholders } from "./FuturePlaceholders.tsx";
import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from "./maplibre.ts";
import { DETAIL_MIN_ZOOM, HIT_TOLERANCE_PX, nearestPoint } from "./hitTest.ts";
import { LeadEditor } from "./LeadEditor.tsx";
import { LeadsList } from "./LeadsList.tsx";
import { ParcelDetail } from "./ParcelDetail.tsx";
import { useDebounced } from "./useDebounced.ts";

const EMPTY = { type: "FeatureCollection", features: [] } as const;
const params = new URLSearchParams(location.search);
/** tRPC error code of a failed call (e.g. "CONFLICT"), if any. */
const codeOf = (e: unknown) =>
  (e as { data?: { code?: string } } | undefined)?.data?.code;

export function App() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>(null);
  const marker = useRef<Marker>(null);
  const [api, setApi] = useState<ApiClient>();
  /** Latest API client for handlers registered once (map events); avoids a stale closure over `api`. */
  const apiRef = useRef<ApiClient | undefined>(undefined);
  /** Search key of the data last given to the points source (written to the map element on every "idle"). */
  const renderedSearchRef = useRef("");
  const [error, setError] = useState<string>();
  const [center, setCenter] = useState<LatLon>();
  const [radius, setRadius] = useState(1);
  const [threshold, setThreshold] = useState(15);
  /** Last query result, tagged with the debounced key it answers (loading = the key has no result yet). */
  const [result, setResult] = useState<{
    key: string;
    search: SearchResult;
    points: PointsResult;
  }>();
  const [failed, setFailed] = useState<{ key: string; message: string }>();
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Detail>();
  const [gpsMsg, setGpsMsg] = useState<string>();
  // Leads (increment 3): the leads API client, all leads, and the lead of the parcel in the detail panel.
  const [leadsApi, setLeadsApi] = useState<LeadsClient>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsError, setLeadsError] = useState<string>();
  const [leadBusy, setLeadBusy] = useState(false);
  // Debounce a stable primitive key (an object would change identity on every render and re-fire forever).
  // The search key: pin rounded to 6 decimals (as in data-pin-*), radius and threshold.
  const key = useDebounced(
    center
      ? `${center.lat.toFixed(6)},${center.lon.toFixed(6)}|${radius}|${threshold}`
      : "",
    250,
  );
  const q = useMemo(() => {
    if (!key) return undefined;
    const [ll, r, t] = key.split("|");
    const [lat, lon] = ll!.split(",").map(Number);
    return {
      lat: lat!,
      lon: lon!,
      radius_miles: Number(r),
      threshold_years: Number(t),
    };
  }, [key]);
  const search = result?.search;
  const points = result?.points;
  const loading = !!key && result?.key !== key && failed?.key !== key;
  const queryError = failed?.key === key ? failed.message : undefined;

  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  /** Opens the details panel with the CURRENT client (stable function, safe in map handlers). */
  const openDetail = useCallback(async (id: string) => {
    const client = apiRef.current;
    if (!client) return;
    try {
      setDetail(await client.parcels.detail.query({ parcel_id: id }));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  /** The single writer of the map centre attributes (read by tests and tooling), called on "load" and "moveend". */
  const writeCenter = useCallback((m: MapLibreMap) => {
    const c = m.getCenter();
    mapEl.current!.dataset.centerLat = c.lat.toFixed(6);
    mapEl.current!.dataset.centerLon = c.lng.toFixed(6);
  }, []);

  const recentre = useCallback((p: LatLon) => {
    setCenter(p);
    setOffset(0);
    // Keep the current zoom: without it the globe projection adjusts the zoom on a latitude pan.
    const m = map.current;
    m?.easeTo({ center: [p.lon, p.lat], zoom: m.getZoom(), duration: 0 });
  }, []);

  // Config, API client and map.
  useEffect(() => {
    loadConfig()
      .then((cfg) => {
        // Updater form: the tRPC client is a callable proxy, so setApi(client) would be treated as an updater.
        if (cfg.apiUrl && cfg.apiToken) {
          const client = createApiClient({
            apiUrl: cfg.apiUrl,
            apiToken: cfg.apiToken,
          });
          setApi(() => client);
          if (cfg.leadsApiUrl) {
            const leadsClient = createLeadsClient({
              leadsApiUrl: cfg.leadsApiUrl,
              apiToken: cfg.apiToken,
            });
            setLeadsApi(() => leadsClient);
          }
        }
        const lat = Number(params.get("lat")),
          lon = Number(params.get("lon")),
          z = Number(params.get("z"));
        const m = new MapLibreMap({
          container: mapEl.current!,
          style: mapStyleUrl(cfg.mapKey ?? ""),
          ...(lat && lon
            ? { center: [lon, lat] as [number, number], zoom: z || 12 }
            : { bounds: LA_COUNTY_BOUNDS }),
        });
        m.addControl(new NavigationControl({ showCompass: false }));
        m.on("load", () => {
          m.addSource("radius", { type: "geojson", data: EMPTY });
          m.addLayer({
            id: "radius-fill",
            type: "fill",
            source: "radius",
            paint: { "fill-color": "#ffbb45", "fill-opacity": 0.12 },
          });
          m.addLayer({
            id: "radius-line",
            type: "line",
            source: "radius",
            paint: { "line-color": "#d14600", "line-width": 2 },
          });
          m.addSource("points", { type: "geojson", data: EMPTY });
          m.addLayer({
            id: "points",
            type: "circle",
            source: "points",
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                1.5,
                15,
                5,
              ],
              "circle-color": "#c20030",
              "circle-opacity": 0.75,
            },
          });
          m.on(
            "mouseenter",
            "points",
            () => (m.getCanvas().style.cursor = "pointer"),
          );
          m.on("mouseleave", "points", () => (m.getCanvas().style.cursor = ""));
          writeCenter(m);
          mapEl.current!.dataset.ready = "true";
        });
        // One click handler: from DETAIL_MIN_ZOOM up, a click within +/-HIT_TOLERANCE_PX of a point opens the
        // nearest point's details; otherwise (or below that zoom) it drops the pin.
        m.on("click", (e) => {
          if (m.getZoom() >= DETAIL_MIN_ZOOM) {
            const { x, y } = e.point;
            const t = HIT_TOLERANCE_PX;
            const hits = m.queryRenderedFeatures(
              [
                [x - t, y - t],
                [x + t, y + t],
              ],
              { layers: ["points"] },
            );
            const hit = nearestPoint(hits, e.point, (c) => m.project(c));
            if (hit) {
              void openDetail(hit.id);
              return;
            }
          }
          recentre({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        });
        m.on("moveend", () => writeCenter(m));
        // Render marker, on every "idle" (everything drawn): the search key of the drawn points and the zoom.
        m.on("idle", () => {
          mapEl.current!.dataset.renderedSearch = renderedSearchRef.current;
          mapEl.current!.dataset.renderedZoom = String(m.getZoom());
        });
        map.current = m;
      })
      .catch((e: Error) => setError(e.message));
    return () => map.current?.remove();
  }, [openDetail, recentre, writeCenter]);

  // Pin and radius circle.
  useEffect(() => {
    const m = map.current;
    if (!m || !center) return;
    marker.current ??= new Marker({ color: "#232b37" });
    marker.current.setLngLat([center.lon, center.lat]).addTo(m);
    mapEl.current!.dataset.pinLat = center.lat.toFixed(6);
    mapEl.current!.dataset.pinLon = center.lon.toFixed(6);
    const ring = circleRing(center, radius);
    (m.getSource("radius") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    // The radius actually drawn, measured from the ring (read by tests to check the circle).
    mapEl.current!.dataset.circleRadiusMiles = haversineMiles(center, {
      lat: ring[0]![1],
      lon: ring[0]![0],
    }).toFixed(3);
  }, [center, radius]);

  // Query the data API (count, page, map points).
  // State changes happen only in the async callbacks; "loading" is derived from the key.
  useEffect(() => {
    if (!api || !q) return;
    let live = true;
    Promise.all([
      api.parcels.search.query({ ...q, offset: 0, limit: 50 }),
      api.parcels.points.query(q),
    ])
      .then(([s, p]) => {
        if (!live) return;
        setResult({ key, search: s, points: p });
        setOffset(0);
      })
      .catch((e: Error) => live && setFailed({ key, message: e.message }));
    return () => {
      live = false;
    };
  }, [api, q, key]);

  // Points layer. The same code records which search the drawn points belong to.
  useEffect(() => {
    const src = map.current?.getSource("points") as GeoJSONSource | undefined;
    if (!src) return;
    renderedSearchRef.current = result?.key ?? "";
    src.setData(
      points
        ? {
            type: "FeatureCollection",
            features: points.id.map((id, i) => ({
              type: "Feature",
              properties: { id },
              geometry: {
                type: "Point",
                coordinates: [points.lon[i]!, points.lat[i]!],
              },
            })),
          }
        : EMPTY,
    );
  }, [points, result?.key]);

  // All leads (a small table: paged Scan, up to 20 pages of 100).
  useEffect(() => {
    if (!leadsApi) return;
    let live = true;
    (async () => {
      const all: Lead[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 20; i++) {
        const p = await leadsApi.leads.list.query({ limit: 100, cursor });
        all.push(...p.items);
        if (!p.next_cursor) break;
        cursor = p.next_cursor;
      }
      if (live) setLeads(all);
    })().catch((e: Error) => live && setLeadsError(e.message));
    return () => {
      live = false;
    };
  }, [leadsApi]);

  // The lead of the parcel in the detail panel, read fresh on open and on "Reload". State is keyed by the
  // parcel, so "loading" is derived and state changes only happen in the async callbacks.
  const detailId = detail
    ? String((detail.property as { parcel_id?: unknown }).parcel_id)
    : undefined;
  const [leadFor, setLeadFor] = useState<{ id: string; lead: Lead | null }>();
  const [leadMsg, setLeadMsg] = useState<{
    id: string;
    error?: string;
    conflict?: boolean;
  }>();
  const [reloads, setReloads] = useState(0);
  const detailLead = leadFor?.id === detailId ? leadFor?.lead : undefined;
  const msg = leadMsg?.id === detailId ? leadMsg : undefined;
  useEffect(() => {
    if (!leadsApi || !detailId) return;
    let live = true;
    leadsApi.leads.get.query({ parcel_id: detailId }).then(
      (lead) => {
        if (!live) return;
        setLeadFor({ id: detailId, lead });
        setLeadMsg(undefined);
      },
      (e: Error) => live && setLeadMsg({ id: detailId, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [leadsApi, detailId, reloads]);
  const reloadLead = () => {
    setLeadFor(undefined);
    setReloads((n) => n + 1);
  };

  /** Runs a lead write; keeps the list in step; a CONFLICT asks for a reload. */
  const leadWrite = async (run: () => Promise<Lead | null>) => {
    const id = detailId!;
    setLeadBusy(true);
    setLeadMsg(undefined);
    try {
      const l = await run();
      setLeadFor({ id, lead: l });
      setLeads((all) => {
        const rest = all.filter((x) => x.parcel_id !== id);
        return l ? [...rest, l] : rest;
      });
    } catch (e) {
      setLeadMsg(
        codeOf(e) === "CONFLICT"
          ? { id, conflict: true }
          : { id, error: (e as Error).message },
      );
    } finally {
      setLeadBusy(false);
    }
  };
  const createLead = (v: { status: LeadStatus; notes: string }) =>
    void leadWrite(() =>
      leadsApi!.leads.create.mutate({ parcel_id: detailId!, ...v }),
    );
  const saveLead = (v: { status: LeadStatus; notes: string }) =>
    void leadWrite(() =>
      leadsApi!.leads.update.mutate({
        parcel_id: detailId!,
        expected_updated_at: detailLead!.updated_at,
        ...v,
      }),
    );
  const deleteLead = () =>
    void leadWrite(async () => {
      await leadsApi!.leads.delete.mutate({
        parcel_id: detailId!,
        expected_updated_at: detailLead!.updated_at,
      });
      return null;
    });
  const searchIds = useMemo(
    () => (points ? new Set(points.id) : undefined),
    [points],
  );

  const page = async (off: number) => {
    if (!api || !center) return;
    try {
      const s = await api.parcels.search.query({
        lat: center.lat,
        lon: center.lon,
        radius_miles: radius,
        threshold_years: threshold,
        offset: off,
        limit: 50,
      });
      setResult((r) => r && { ...r, search: s });
      setOffset(off);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const gps = () => {
    setGpsMsg(undefined);
    if (!navigator.geolocation)
      return setGpsMsg("This browser has no GPS/geolocation.");
    navigator.geolocation.getCurrentPosition(
      (p) => recentre({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => setGpsMsg(`Location unavailable: ${e.message}`),
      { timeout: 10_000 },
    );
  };
  const countText = useMemo(
    () =>
      !center
        ? "0 results · drop a pin or use GPS"
        : loading && !search
          ? "Searching…"
          : `${(search?.count ?? 0).toLocaleString("en-US")} results`,
    [center, loading, search],
  );

  return (
    <div className="layout">
      <header>
        <h1>Roofing CRM · lead map</h1>
        <span
          className="count"
          data-testid="result-count"
          data-count={search?.count ?? 0}
          aria-live="polite"
        >
          {countText}
        </span>
        {loading && (
          <span className="notice" style={{ color: "#fff" }}>
            updating…
          </span>
        )}
      </header>
      <aside>
        <section className="controls">
          <p className="notice">
            Opens on Los Angeles County. Click the map to drop a pin, or use
            GPS. Data: City of LA, ZIP 91405/91406/91411 (roll 2026 pilot
            slice).
          </p>
          <div className="row">
            <button data-testid="gps" onClick={gps}>
              Use my location
            </button>
          </div>
          {gpsMsg && <p className="error">{gpsMsg}</p>}
          <label htmlFor="radius">
            Radius: <b data-testid="radius-value">{radius}</b> miles
          </label>
          <input
            id="radius"
            data-testid="radius"
            type="range"
            min={0.25}
            max={10}
            step={0.25}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
          <label htmlFor="threshold">Roof older than (years)</label>
          <div className="row">
            <input
              id="threshold"
              data-testid="threshold"
              type="number"
              min={1}
              max={120}
              value={threshold}
              onChange={(e) =>
                setThreshold(
                  Math.max(1, Math.min(120, Number(e.target.value) || 1)),
                )
              }
            />
            <input
              aria-label="Roof age threshold slider"
              type="range"
              min={1}
              max={120}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
          <p className="rule" data-testid="rule">
            {search?.rule.text ??
              `Roof age is a proxy (assessor year built): older than ${threshold} years means built before roll year − ${threshold}.`}
          </p>
        </section>
        {(queryError ?? error) && (
          <p className="error" data-testid="error">
            {queryError ?? error}
          </p>
        )}
        {search && (
          <section>
            <div className="row">
              <span className="notice">
                Showing {search.items.length ? offset + 1 : 0}–
                {offset + search.items.length} by distance
              </span>
              <button
                disabled={offset === 0}
                onClick={() => void page(Math.max(0, offset - 50))}
              >
                Prev
              </button>
              <button
                disabled={search.next_offset === null}
                onClick={() => void page(search.next_offset!)}
              >
                Next
              </button>
            </div>
            <ul className="list" data-testid="results">
              {search.items.map((i) => (
                <li
                  key={i.parcel_id}
                  data-testid="result"
                  data-distance={i.distance_miles}
                  onClick={() => void openDetail(i.parcel_id)}
                >
                  <b>{i.address ?? i.parcel_id}</b>
                  <br />
                  built {i.year_built} · roof-age proxy {i.roof_age_years_proxy}{" "}
                  y · {i.distance_miles} mi
                </li>
              ))}
            </ul>
          </section>
        )}
        {leadsApi && (
          <LeadsList
            leads={leads}
            searchIds={searchIds}
            error={leadsError}
            onOpen={(id) => void openDetail(id)}
          />
        )}
        <FuturePlaceholders />
      </aside>
      <div className="map">
        <div id="map" ref={mapEl} data-testid="map" />
        {detail && (
          <ParcelDetail detail={detail} onClose={() => setDetail(undefined)}>
            {leadsApi && detailId && (
              <LeadEditor
                parcelId={detailId}
                lead={detailLead}
                busy={leadBusy}
                error={msg?.error}
                conflict={!!msg?.conflict}
                onCreate={createLead}
                onSave={saveLead}
                onDelete={deleteLead}
                onReload={reloadLead}
              />
            )}
          </ParcelDetail>
        )}
      </div>
    </div>
  );
}
