import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createApiClient,
  type ApiClient,
  type ParcelDetail as Detail,
  type PointsResult,
  type RunSummary,
  type SearchItem,
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
import { createAgentApi, type AgentApi } from "./agent-api.ts";
import type { AgentCenter, AgentScreen } from "./agent-types.ts";
import { AskAgent } from "./AskAgent.tsx";
import { mapStyleUrl } from "./basemap.ts";
import { loadConfig } from "./config.ts";
import { DataNotice } from "./DataNotice.tsx";
import { FuturePlaceholders } from "./FuturePlaceholders.tsx";
import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
} from "./maplibre.ts";
import { DETAIL_MIN_ZOOM, HIT_TOLERANCE_PX, nearestPoint } from "./hitTest.ts";
import { LeadEditor } from "./LeadEditor.tsx";
import { filterOfKey, searchKeyOf, useLeadsInSearch } from "./leadsInSearch.ts";
import { LEADS_MAX_PAGES, LEADS_PAGE_SIZE, LeadsList } from "./LeadsList.tsx";
import {
  BASES,
  OWNERSHIP_OFF,
  OWNERSHIP_TEXTS,
  PROXY_NOTE,
  type OwnershipFilter,
} from "./ownership.ts";
import { ParcelDetail } from "./ParcelDetail.tsx";
import { ParcelPermits } from "./ParcelPermits.tsx";
import { inputValue, readNumber, THRESHOLD, typed } from "./numeric.ts";
import {
  daysOfKey,
  DEFAULT_WINDOW,
  DEFAULT_WINDOW_TEXT,
  openDaysText,
  readWindow,
  roofBasisLabel,
  windowKey,
  type WindowText,
} from "./permitDisplay.ts";
import { permitsApi } from "./permitsApi.ts";
import { PermitsList } from "./PermitsList.tsx";
import { useDebounced } from "./useDebounced.ts";

const EMPTY = { type: "FeatureCollection", features: [] } as const;
/** The map layers that hold parcel points (a click on either opens the parcel). */
const POINT_LAYERS = ["points", "points-long-open"];
const params = new URLSearchParams(location.search);
/** How the pin was placed (the label of the center sent to the agent). */
type PinLabel = "map pin" | "my location";
/** tRPC error code of a failed call (e.g. "CONFLICT"), if any. */
const codeOf = (e: unknown) =>
  (e as { data?: { code?: string } } | undefined)?.data?.code;
/** A result's roof: the effective roof year (the filter's), with its basis ("permit" or "year built"). */
const roofText = (i: SearchItem) => {
  const basis = roofBasisLabel(i.roof_age_basis);
  return `roof year ${i.effective_roof_year}${basis ? ` (${basis})` : ""}`;
};

export function App() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap>(null);
  const marker = useRef<Marker>(null);
  const [api, setApi] = useState<ApiClient>();
  /** Latest API client for handlers registered once (map events); avoids a stale closure over `api`. */
  const apiRef = useRef<ApiClient | undefined>(undefined);
  /** Search key of the data last given to the points source (written to the map element on every "idle"). */
  const renderedSearchRef = useRef("");
  /** Window (windowKey) of the long-open highlight last given to the points source (written on "idle" too). */
  const renderedWinRef = useRef("");
  const [error, setError] = useState<string>();
  const [center, setCenter] = useState<LatLon>();
  const [radius, setRadius] = useState(1);
  /** The roof-age threshold of the search: the last valid one typed (or set on the slider). */
  const [threshold, setThreshold] = useState(15);
  /** The threshold field as typed; while it is empty or invalid, a message shows and the search keeps the last. */
  const [thresholdText, setThresholdText] = useState("15");
  const thresholdRead = readNumber(thresholdText, THRESHOLD);
  /** The ownership filter: off by default; turned on, "both" is preselected. */
  const [ownership, setOwnership] = useState<OwnershipFilter>(OWNERSHIP_OFF);
  /**
   * Last query result, tagged with the debounced key it answers (loading = the key has no result yet) and with
   * the open-duration window (windowKey, in days) its points' long-open highlight was asked for.
   */
  const [result, setResult] = useState<{
    key: string;
    search: SearchResult;
    points: PointsResult;
    win: string;
  }>();
  /** A failed highlight update (points for a new window), tagged with the search key and window it was for. */
  const [highlightFailed, setHighlightFailed] = useState<{
    key: string;
    win: string;
    message: string;
  }>();
  const [failed, setFailed] = useState<{ key: string; message: string }>();
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Detail>();
  const [gpsMsg, setGpsMsg] = useState<string>();
  /** How the pin was placed: the label of the center sent to the agent. */
  const [pinLabel, setPinLabel] = useState<PinLabel>("map pin");
  /** The agent API (config.json agentApiUrl); the "Ask the agent" section is shown only with it. */
  const [agent, setAgent] = useState<{
    api: AgentApi;
    warmData: () => Promise<unknown>;
  }>();
  // Leads (increment 3): the leads API client, all leads, and the lead of the parcel in the detail panel.
  const [leadsApi, setLeadsApi] = useState<LeadsClient>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsError, setLeadsError] = useState<string>();
  /** True when the last page read still had a next cursor: more leads are stored than the list loaded. */
  const [leadsCapped, setLeadsCapped] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  /** The "Leads in this search" filter; parcels.match calls are made only while it or the toggle is on. */
  const [inSearch, setInSearch] = useState(false);
  /** The lead list's "Has a long-open roofing permit" toggle (the map's open-duration window). */
  const [leadsLongOpen, setLeadsLongOpen] = useState(false);
  /** The open-duration window's fields as typed (long-open list, map highlight, lead toggle, parcel detail). */
  const [windowText, setWindowText] = useState<WindowText>(DEFAULT_WINDOW_TEXT);
  /** The window read from them; undefined (with the message) while a field is empty or invalid. */
  const windowRead = useMemo(() => readWindow(windowText), [windowText]);
  const permitWindow = windowRead.window;
  /** The served run (explorer.runSummary), for the data notice. */
  const [run, setRun] = useState<{ run?: RunSummary["run"]; error?: string }>();
  // Debounce a stable primitive key (an object would change identity on every render and re-fire forever).
  // The search key: pin rounded to 6 decimals (as in data-pin-*), radius, threshold and, when the ownership
  // filter is on, its basis (searchKeyOf).
  const key = useDebounced(
    center
      ? searchKeyOf(
          center.lat,
          center.lon,
          radius,
          threshold,
          ownership.on ? ownership.basis : undefined,
        )
      : "",
    250,
  );
  const q = useMemo(() => (key ? filterOfKey(key) : undefined), [key]);
  const search = result?.search;
  const points = result?.points;
  /**
   * The map highlight's window: the long-open list's (same days), debounced like it; "" while the window is
   * invalid (no call; the map keeps its last highlight).
   */
  const winKey = useDebounced(permitWindow ? windowKey(permitWindow) : "", 250);
  /** The last valid highlight window, for the points of a new search (read only in effects). */
  const winRef = useRef(windowKey(DEFAULT_WINDOW));
  const loading = !!key && result?.key !== key && failed?.key !== key;
  const queryError = failed?.key === key ? failed.message : undefined;

  useEffect(() => {
    apiRef.current = api;
  }, [api]);
  const permits = useMemo(() => api && permitsApi(api), [api]);

  /**
   * Opens the details panel with the CURRENT client (stable function, safe in map handlers); resolves with the
   * detail shown, or undefined when it could not be read.
   */
  const openDetail = useCallback(async (id: string) => {
    const client = apiRef.current;
    if (!client) return undefined;
    try {
      const d = await client.parcels.detail.query({ parcel_id: id });
      setDetail(d);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }, []);

  /** The single writer of the map centre attributes (read by tests and tooling), called on "load" and "moveend". */
  const writeCenter = useCallback((m: MapLibreMap) => {
    const c = m.getCenter();
    mapEl.current!.dataset.centerLat = c.lat.toFixed(6);
    mapEl.current!.dataset.centerLon = c.lng.toFixed(6);
  }, []);

  /** Pans the map to a point (the pin and the search stay). */
  const panTo = useCallback((p: LatLon) => {
    // Keep the current zoom: without it the globe projection adjusts the zoom on a latitude pan.
    const m = map.current;
    m?.easeTo({ center: [p.lon, p.lat], zoom: m.getZoom(), duration: 0 });
  }, []);

  /** Moves the pin (a new search) and pans the map to it. */
  const recentre = useCallback(
    (p: LatLon, label: PinLabel = "map pin") => {
      setCenter(p);
      setPinLabel(label);
      setOffset(0);
      panTo(p);
    },
    [panTo],
  );

  /**
   * A parcel ID in the agent's Sources: opens the parcel's detail (as a map click does) and pans the map to the
   * parcel's coordinates from that detail. The pin and the search stay where they are.
   */
  const openParcelOnMap = useCallback(
    async (id: string) => {
      const d = await openDetail(id);
      const p = d?.property as
        { latitude?: unknown; longitude?: unknown } | undefined;
      if (
        typeof p?.latitude === "number" &&
        typeof p.longitude === "number" &&
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude)
      )
        panTo({ lat: p.latitude, lon: p.longitude });
    },
    [openDetail, panTo],
  );

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
          if (cfg.agentApiUrl) {
            const apiUrl = cfg.apiUrl,
              apiToken = cfg.apiToken;
            setAgent({
              api: createAgentApi({ agentApiUrl: cfg.agentApiUrl, apiToken }),
              // A client of its own per warm-up request: each goes out as its own HTTP request (never batched
              // with the other). explorer.sources takes about 0.8 s, so the two overlap and two data API
              // instances are warmed.
              warmData: () =>
                createApiClient({ apiUrl, apiToken }).explorer.sources.query(),
            });
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
          // Parcels with a long-open roofing permit (parcels.points long_open_permit = 1), drawn over the
          // points: larger, blue with a white ring.
          m.addLayer({
            id: "points-long-open",
            type: "circle",
            source: "points",
            filter: ["==", ["get", "long_open"], 1],
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10,
                3,
                15,
                7,
              ],
              "circle-color": "#1f5fd1",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            },
          });
          m.on(
            "mouseenter",
            "points",
            () => (m.getCanvas().style.cursor = "pointer"),
          );
          m.on("mouseleave", "points", () => (m.getCanvas().style.cursor = ""));
          m.on(
            "mouseenter",
            "points-long-open",
            () => (m.getCanvas().style.cursor = "pointer"),
          );
          m.on(
            "mouseleave",
            "points-long-open",
            () => (m.getCanvas().style.cursor = ""),
          );
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
              { layers: POINT_LAYERS },
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
          mapEl.current!.dataset.renderedLongOpen = renderedWinRef.current;
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

  // Keep the last valid highlight window for the next search (declared before the query, so it runs first).
  useEffect(() => {
    if (winKey) winRef.current = winKey;
  }, [winKey]);

  // Query the data API (count, page, map points with the long-open highlight of the current window).
  // State changes happen only in the async callbacks; "loading" is derived from the key.
  useEffect(() => {
    if (!api || !q) return;
    let live = true;
    const win = winRef.current;
    Promise.all([
      api.parcels.search.query({ ...q, offset: 0, limit: 50 }),
      api.parcels.points.query({ ...q, ...daysOfKey(win) }),
    ])
      .then(([s, p]) => {
        if (!live) return;
        setResult({ key, search: s, points: p, win });
        setOffset(0);
      })
      .catch((e: Error) => live && setFailed({ key, message: e.message }));
    return () => {
      live = false;
    };
  }, [api, q, key]);

  // A new open-duration window with the same search: only the points are asked again (the same parcels, a
  // new long_open_permit column); the count and the list stay. One call per window change.
  const resultKey = result?.key;
  const resultWin = result?.win;
  useEffect(() => {
    if (!api || !winKey || !resultKey || resultKey !== key) return;
    if (resultWin === winKey) return;
    let live = true;
    const k = resultKey,
      w = winKey;
    api.parcels.points.query({ ...filterOfKey(k), ...daysOfKey(w) }).then(
      (p) => {
        if (live)
          setResult((r) => (r?.key === k ? { ...r, points: p, win: w } : r));
      },
      (e: Error) =>
        live && setHighlightFailed({ key: k, win: w, message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [api, key, resultKey, resultWin, winKey]);

  // Points layer. The same code records which search the drawn points belong to.
  useEffect(() => {
    const src = map.current?.getSource("points") as GeoJSONSource | undefined;
    if (!src) return;
    renderedSearchRef.current = result?.key ?? "";
    renderedWinRef.current = result?.win ?? "";
    src.setData(
      points
        ? {
            type: "FeatureCollection",
            features: points.id.map((id, i) => ({
              type: "Feature",
              // long_open: 1 if the parcel has a long-open roofing permit in the window (the highlight layer).
              properties: { id, long_open: points.long_open_permit?.[i] ?? 0 },
              geometry: {
                type: "Point",
                coordinates: [points.lon[i]!, points.lat[i]!],
              },
            })),
          }
        : EMPTY,
    );
  }, [points, result?.key, result?.win]);

  // The served run, once per client.
  useEffect(() => {
    if (!api) return;
    let live = true;
    api.explorer.runSummary.query().then(
      (s) => live && setRun({ run: s.run }),
      (e: Error) => live && setRun({ error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [api]);

  // All leads (a small table: paged Scan, up to LEADS_MAX_PAGES pages of LEADS_PAGE_SIZE). When the last
  // page still has a next cursor, the list says it shows only the first leads.
  useEffect(() => {
    if (!leadsApi) return;
    let live = true;
    (async () => {
      const all: Lead[] = [];
      let cursor: string | undefined;
      let more = false;
      for (let i = 0; i < LEADS_MAX_PAGES; i++) {
        const p = await leadsApi.leads.list.query({
          limit: LEADS_PAGE_SIZE,
          cursor,
        });
        all.push(...p.items);
        more = p.next_cursor !== null;
        if (!p.next_cursor) break;
        cursor = p.next_cursor;
      }
      if (live) {
        setLeads(all);
        setLeadsCapped(more);
      }
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
  const leadIds = useMemo(() => leads.map((l) => l.parcel_id), [leads]);
  const leadsInSearch = useLeadsInSearch(
    api,
    result,
    leadIds,
    inSearch,
    leadsLongOpen ? winKey : undefined,
  );

  const page = async (off: number) => {
    if (!api || !center) return;
    try {
      const s = await api.parcels.search.query({
        lat: center.lat,
        lon: center.lon,
        radius_miles: radius,
        threshold_years: threshold,
        ...(ownership.on ? { ownership_basis: ownership.basis } : {}),
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
      (p) =>
        recentre(
          { lat: p.coords.latitude, lon: p.coords.longitude },
          "my location",
        ),
      (e) => setGpsMsg(`Location unavailable: ${e.message}`),
      { timeout: 10_000 },
    );
  };
  /** The drawn parcels the highlight marks: the sum of long_open_permit (undefined from an API without it). */
  const longOpenDrawn = points?.long_open_permit?.reduce<number>(
    (n, x) => n + x,
    0,
  );
  /** The drawn highlight's window in words ("open at least 1,826 days"). */
  const legendWindow = result
    ? openDaysText(
        daysOfKey(result.win).min_open_days,
        daysOfKey(result.win).max_open_days,
      )
    : "";
  const highlightError =
    highlightFailed &&
    highlightFailed.key === key &&
    highlightFailed.win === winKey &&
    result?.win !== winKey
      ? highlightFailed.message
      : undefined;
  /** The center sent with a question: the pin, labelled by how it was placed. */
  const agentCenter = useMemo<AgentCenter | undefined>(
    () => center && { lat: center.lat, lon: center.lon, label: pinLabel },
    [center, pinLabel],
  );
  /** The screen's search values sent with a question: the radius and the last valid threshold. */
  const agentScreen = useMemo<AgentScreen>(
    () => ({ radius_miles: radius, threshold_years: threshold }),
    [radius, threshold],
  );
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
          <DataNotice run={run?.run} error={run?.error} />
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
              min={THRESHOLD.min}
              max={THRESHOLD.max}
              step={1}
              value={inputValue(thresholdText)}
              onChange={(e) => {
                const text = typed(e);
                setThresholdText(text);
                const r = readNumber(text, THRESHOLD);
                if ("value" in r) setThreshold(r.value);
              }}
            />
            <input
              aria-label="Roof age threshold slider"
              type="range"
              min={1}
              max={120}
              value={threshold}
              onChange={(e) => {
                setThreshold(Number(e.target.value));
                setThresholdText(e.target.value);
              }}
              style={{ flex: 1 }}
            />
          </div>
          {"error" in thresholdRead && (
            <p className="error" data-testid="threshold-error" role="alert">
              {thresholdRead.error} The search keeps {threshold} years until
              then.
            </p>
          )}
          <p className="rule" data-testid="rule">
            {search?.rule.text ??
              `Roof age counts from the effective roof year: the later of the assessor year built and the year of the latest finaled roofing permit. Older than ${threshold} years means an effective roof year before roll year − ${threshold}.`}
          </p>
          <fieldset className="ownership" data-testid="ownership">
            <legend>
              <label>
                <input
                  type="checkbox"
                  data-testid="ownership-on"
                  checked={ownership.on}
                  onChange={(e) =>
                    setOwnership((o) => ({ ...o, on: e.target.checked }))
                  }
                />{" "}
                Owner unchanged for 10 years or more (ownership filter)
              </label>
            </legend>
            {ownership.on && (
              <>
                {BASES.map(([basis, label]) => (
                  <div
                    key={basis}
                    className="basis"
                    data-testid="ownership-basis"
                    data-basis={basis}
                  >
                    <label>
                      <input
                        type="radio"
                        name="ownership-basis"
                        data-testid={`ownership-basis-${basis}`}
                        value={basis}
                        checked={ownership.basis === basis}
                        onChange={() => setOwnership((o) => ({ ...o, basis }))}
                      />{" "}
                      {label}
                    </label>
                    <p className="notice" data-testid="ownership-text">
                      {OWNERSHIP_TEXTS[basis].text}
                    </p>
                    <p className="notice" data-testid="ownership-weakness">
                      Weakness: {OWNERSHIP_TEXTS[basis].weakness}
                    </p>
                  </div>
                ))}
                <p className="notice" data-testid="ownership-proxy-note">
                  {PROXY_NOTE}
                </p>
              </>
            )}
          </fieldset>
        </section>
        {agent && (
          <AskAgent
            agent={agent.api}
            warmData={agent.warmData}
            center={agentCenter}
            screen={agentScreen}
            onOpenParcel={(id) => void openParcelOnMap(id)}
          />
        )}
        {(queryError ?? error) && (
          <p className="error" data-testid="error">
            {queryError ?? error}
          </p>
        )}
        {search && (
          <section>
            {search.ownership && (
              <p
                className="notice"
                data-testid="ownership-rule"
                data-basis={search.ownership.basis}
              >
                Ownership filter ({search.ownership.basis}):{" "}
                {search.ownership.text} Weakness: {search.ownership.weakness}{" "}
                {search.ownership.proxy_note}
              </p>
            )}
            {points?.truncated && (
              <p className="notice" data-testid="points-truncated">
                Map shows the nearest{" "}
                {points.max_points.toLocaleString("en-US")} of{" "}
                {points.count.toLocaleString("en-US")} matching parcels; the
                count and the list cover all{" "}
                {points.count.toLocaleString("en-US")}.
              </p>
            )}
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
                  {i.year_built === null
                    ? "year built not in source"
                    : `built ${i.year_built}`}{" "}
                  · {roofText(i)} · {i.distance_miles} mi
                </li>
              ))}
            </ul>
          </section>
        )}
        {permits && (
          <PermitsList
            permits={permits}
            center={center}
            radius={radius}
            threshold={threshold}
            windowText={windowText}
            onWindowText={setWindowText}
            openWindow={permitWindow}
            windowError={windowRead.error}
            onOpen={(id) => void openDetail(id)}
          />
        )}
        {leadsApi && (
          <LeadsList
            leads={leads}
            search={leadsInSearch}
            inSearch={inSearch}
            onInSearch={setInSearch}
            longOpen={leadsLongOpen}
            onLongOpen={setLeadsLongOpen}
            windowText={
              winKey
                ? openDaysText(
                    daysOfKey(winKey).min_open_days,
                    daysOfKey(winKey).max_open_days,
                  )
                : undefined
            }
            error={leadsError}
            capped={leadsCapped}
            onOpen={(id) => void openDetail(id)}
          />
        )}
        <FuturePlaceholders />
      </aside>
      <div className="map">
        <div id="map" ref={mapEl} data-testid="map" />
        {points && result && (
          <div className="legend" data-testid="map-legend">
            <div>
              <span className="swatch parcel" aria-hidden="true" />
              Parcel within the radius whose roof is older than{" "}
              {filterOfKey(result.key).threshold_years} years
            </div>
            {longOpenDrawn === undefined ? (
              <div data-testid="legend-long-open-unavailable">
                Long-open roofing permits: not marked by this data API
              </div>
            ) : (
              <div
                data-testid="legend-long-open"
                data-count={longOpenDrawn}
                data-window={result.win}
              >
                <span className="swatch long-open-permit" aria-hidden="true" />
                <span>
                  Has a long-open roofing permit ({legendWindow}):{" "}
                  <b data-testid="legend-long-open-count">
                    {longOpenDrawn.toLocaleString("en-US")}
                  </b>{" "}
                  of the {points.id.length.toLocaleString("en-US")} parcels
                  drawn
                </span>
              </div>
            )}
            {!winKey && (
              <div className="notice" data-testid="legend-window-invalid">
                The open-duration window is invalid; the map keeps the last
                valid one.
              </div>
            )}
            {highlightError && (
              <div className="error" data-testid="legend-error">
                Long-open highlight not updated: {highlightError}
              </div>
            )}
          </div>
        )}
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
            {permits && detailId && (
              <ParcelPermits
                permits={permits}
                parcelId={detailId}
                openWindow={permitWindow}
              />
            )}
          </ParcelDetail>
        )}
      </div>
    </div>
  );
}
