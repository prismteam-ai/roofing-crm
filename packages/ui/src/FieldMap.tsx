import { declutter } from "../../map-domain/src/declutter";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as LibreMap, Marker } from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  Property,
  QueryInput,
  SearchResponse,
} from "../../contracts/src/index";
import {
  LOCATION_ORIGIN,
  locationRequest,
  OFFLINE_BASEMAP,
  validateBasemap,
  type BasemapProvider,
} from "../../map-domain/src/basemap";
import {
  mapFailureDisposition,
  INITIAL_MAP_LOAD_TIMEOUT_MS,
  INITIAL_MAP_RETRY_DELAY_MS,
} from "../../map-domain/src/map-failure";
maplibregl.setWorkerUrl(mapWorkerUrl);
function radiusFeature(lat: number, lng: number, meters: number) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        Array.from({ length: 65 }, (_, i) => {
          const a = (i / 64) * Math.PI * 2;
          return [
            lng +
              (Math.cos(a) * meters) /
                (111320 * Math.cos((lat * Math.PI) / 180)),
            lat + (Math.sin(a) * meters) / 111320,
          ];
        }),
      ],
    },
  };
}
export function FieldMap({
  query,
  rows,
  selected,
  placing,
  onPin,
  onSelect,
  basemap,
  synthetic = false,
  provider = OFFLINE_BASEMAP,
}: {
  query: QueryInput;
  rows: SearchResponse["rows"];
  selected: string | null;
  placing: boolean;
  onPin: (lat: number, lng: number) => void;
  onSelect: (p: Property) => void;
  basemap: boolean;
  synthetic?: boolean;
  provider?: BasemapProvider;
}) {
  const approvedProvider = validateBasemap(provider);
  const halfLat = (query.radiusMeters / 111320) * 1.25;
  const halfLng =
    (query.radiusMeters / (111320 * Math.cos((query.lat * Math.PI) / 180))) *
    1.25;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const pinRef = useRef(onPin);
  const placeRef = useRef(placing);
  const [status, setStatus] = useState<"loading" | "ready" | "fatal">(
    "loading",
  );
  const [warning, setWarning] = useState(false);
  const ready = status === "ready";
  const outsideMercator = Math.abs(query.lat) > 85;
  const fallback = status === "fatal" || outsideMercator;
  pinRef.current = onPin;
  placeRef.current = placing;
  useEffect(() => {
    if (!container.current) return;
    let mounted = true,
      failed = false,
      reachedReady = false;
    let initialRender = false,
      loadedTile = false,
      retries = 0,
      retryPending = false;
    let instance: LibreMap | undefined;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus("loading");
    setWarning(false);
    const clearTimers = () => {
      clearTimeout(loadTimer);
      clearTimeout(retryTimer);
    };
    const removeMap = () => {
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      if (instance) {
        const owned = instance;
        instance = undefined;
        if (map.current === owned) map.current = null;
        owned.remove();
      }
    };
    const fail = () => {
      if (!mounted || failed) return;
      failed = true;
      clearTimers();
      setStatus("fatal");
      removeMap();
    };
    if (outsideMercator) {
      setStatus("fatal");
      return;
    }
    const initialStyle: string | maplibregl.StyleSpecification =
      basemap && approvedProvider.kind === "amazon-location"
        ? `${LOCATION_ORIGIN}/v2/styles/Standard/descriptor`
        : basemap && approvedProvider.kind === "raster"
          ? {
              version: 8,
              sources: {
                provider: {
                  type: "raster",
                  tiles: [approvedProvider.template],
                  tileSize: 256,
                  maxzoom: approvedProvider.maxZoom,
                  attribution: approvedProvider.attribution,
                },
              },
              layers: [
                {
                  id: "paper",
                  type: "background",
                  paint: { "background-color": "#e6ebe4" },
                },
                { id: "provider", type: "raster", source: "provider" },
              ],
            }
          : {
              version: 8,
              sources: {},
              layers: [
                {
                  id: "paper",
                  type: "background",
                  paint: { "background-color": "#e6ebe4" },
                },
              ],
            };
    const armTimeout = () => {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(retryInitial, INITIAL_MAP_LOAD_TIMEOUT_MS);
    };
    const retryInitial = () => {
      if (!mounted || failed || reachedReady || retryPending || !instance)
        return;
      if (retries >= 1) return fail();
      retryPending = true;
      clearTimers();
      retryTimer = setTimeout(() => {
        if (!mounted || failed || reachedReady || !instance) return;
        retryPending = false;
        retries++;
        initialRender = false;
        loadedTile = false;
        try {
          instance.setStyle(initialStyle, { diff: false });
          armTimeout();
        } catch {
          fail();
        }
      }, INITIAL_MAP_RETRY_DELAY_MS);
    };
    const markReady = () => {
      if (
        !mounted ||
        failed ||
        !instance ||
        !initialRender ||
        !instance.isStyleLoaded()
      )
        return;
      const sources = Object.values(instance.getStyle().sources);
      const expectsTiles = sources.some((source) =>
        ["raster", "raster-dem", "vector"].includes(source.type),
      );
      // MapLibre can finish an initial render after every requested tile errored.
      // Do not advertise that blank first render as a working geographic map.
      if (expectsTiles && !loadedTile) return;
      reachedReady = true;
      clearTimers();
      setStatus("ready");
    };
    try {
      instance = new maplibregl.Map({
        container: container.current,
        center: [query.lng, query.lat],
        zoom: 11,
        attributionControl: false,
        transformRequest:
          approvedProvider.kind === "amazon-location"
            ? (resource) => locationRequest(approvedProvider, resource)
            : undefined,
        style: initialStyle,
      });
      map.current = instance;
      if (approvedProvider.kind !== "offline")
        instance.addControl(
          new maplibregl.AttributionControl({
            compact: false,
            customAttribution: approvedProvider.attribution,
          }),
        );
      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      const rendered = () => {
        initialRender = true;
        markReady();
      };
      instance.on("load", rendered);
      instance.on("idle", rendered);
      instance.on("sourcedata", (event) => {
        const tile = event.tile as { state?: string } | undefined;
        if (event.sourceId !== "radius" && tile?.state === "loaded") {
          loadedTile = true;
          markReady();
        }
      });
      instance.on("click", (e) => {
        if (reachedReady && placeRef.current)
          pinRef.current(e.lngLat.lat, e.lngLat.lng);
      });
      instance.on("error", (event) => {
        if (!mounted || failed) return;
        const disposition = mapFailureDisposition(
          event,
          reachedReady,
          typeof initialStyle === "string" ? initialStyle : undefined,
        );
        if (disposition === "fatal") fail();
        else if (disposition === "retry-initial") retryInitial();
        else setWarning(true);
      });
      armTimeout();
    } catch {
      fail();
    }
    return () => {
      mounted = false;
      clearTimers();
      removeMap();
    };
  }, [provider, basemap, outsideMercator]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.isStyleLoaded() || Math.abs(query.lat) > 85) return;
    const feature = radiusFeature(query.lat, query.lng, query.radiusMeters);
    const source = m.getSource("radius") as
      maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(feature);
    else {
      m.addSource("radius", { type: "geojson", data: feature });
      m.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#237a69", "fill-opacity": 0.08 },
      });
      m.addLayer({
        id: "radius-edge",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#328575",
          "line-width": 1.5,
          "line-dasharray": [4, 3],
        },
      });
    }
    m.fitBounds(
      [
        [query.lng - halfLng, query.lat - halfLat],
        [query.lng + halfLng, query.lat + halfLat],
      ],
      { padding: 25, maxZoom: 14, duration: 350 },
    );
    const renderMarkers = () => {
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      const center = document.createElement("div");
      center.className = "center-pin";
      center.title = "Search center";
      markers.current.push(
        new maplibregl.Marker({ element: center })
          .setLngLat([query.lng, query.lat])
          .addTo(m),
      );
      for (const group of declutter(rows, (p) => m.project([p.lng, p.lat]))) {
        const row = group.members[0];
        const button = document.createElement("button");
        button.type = "button";
        button.className = `property-marker ${group.members.some((p) => p.id === selected) ? "selected" : ""}`;
        button.dataset.propertyIds = JSON.stringify(
          group.members.map((p) => p.id),
        );
        if (group.members.length === 1) {
          button.setAttribute("aria-label", `Map property ${row.id}`);
          button.dataset.propertyId = row.id;
          button.textContent = row.permits.some(
            (x) => x.status === "open" && x.kind !== "other",
          )
            ? "P"
            : "•";
          button.onclick = (e) => {
            e.stopPropagation();
            onSelect(row);
          };
        } else {
          button.setAttribute(
            "aria-label",
            `Zoom to ${group.members.length} grouped properties`,
          );
          button.classList.add("property-cluster");
          button.textContent = String(group.members.length);
          button.onclick = (e) => {
            e.stopPropagation();
            m.easeTo({
              center: [group.lng, group.lat],
              zoom: Math.min(18, m.getZoom() + 2),
              duration: 300,
            });
          };
        }
        markers.current.push(
          new maplibregl.Marker({ element: button })
            .setLngLat([group.lng, group.lat])
            .addTo(m),
        );
      }
    };
    renderMarkers();
    m.on("moveend", renderMarkers);
    return () => {
      m.off("moveend", renderMarkers);
    };
  }, [query, rows, ready, selected, onSelect]);

  useEffect(() => {
    if (
      ready &&
      map.current?.isStyleLoaded() &&
      map.current.getLayer("provider")
    )
      map.current.setLayoutProperty(
        "provider",
        "visibility",
        basemap ? "visible" : "none",
      );
  }, [basemap, ready]);
  return (
    <div
      className={`field-map ${placing ? "placing" : ""}`}
      role="region"
      data-testid="property-map"
      data-map-renderer={fallback ? "fallback" : ready ? "maplibre" : "loading"}
      data-map-warning={warning && ready ? "partial-resources" : undefined}
      aria-busy={!fallback && !ready}
      data-property-ids={JSON.stringify(
        rows
          .filter((p) => p.coordinates)
          .map((p) => p.id)
          .sort(),
      )}
      aria-label="Map and search area"
    >
      <div ref={container} className="map-canvas" hidden={fallback} />
      <div className="map-topline">
        <span className="map-label">OAKLAND COUNTY, MI</span>
        <span className="map-label muted">
          {basemap
            ? approvedProvider.kind !== "offline"
              ? approvedProvider.kind === "amazon-location"
                ? "Amazon Location · Standard"
                : approvedProvider.id === "openstreetmap-standard"
                  ? "OpenStreetMap · Standard"
                  : "Approved street basemap"
              : "Offline coordinate plot"
            : "Basemap unavailable · points retained"}
        </span>
      </div>

      {!fallback && !ready && (
        <div className="map-loading" role="status">
          <strong>Loading geographic map…</strong>
          <span>Your search results remain available beside the map.</span>
        </div>
      )}
      {ready && warning && (
        <div className="map-warning" role="status">
          Some map details could not load. You can continue using the map.
        </div>
      )}
      {fallback && (
        <div
          className="fallback-map"
          aria-label="Accessible map fallback"
          onClick={(e) => {
            if (!placing) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPin(
              query.lat + (0.5 - (e.clientY - r.top) / r.height) * halfLat * 2,
              query.lng + ((e.clientX - r.left) / r.width - 0.5) * halfLng * 2,
            );
          }}
        >
          <div className="fallback-circle" />
          {rows
            .filter((x) => x.coordinates)
            .map((p) => (
              <button
                key={p.id}
                className={`property-marker fallback-marker ${selected === p.id ? "selected" : ""}`}
                style={{
                  left: `${50 + ((p.coordinates!.lng - query.lng) / (halfLng * 2)) * 100}%`,
                  top: `${50 - ((p.coordinates!.lat - query.lat) / (halfLat * 2)) * 100}%`,
                }}
                aria-label={`Map property ${p.id}`}
                data-property-id={p.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(p);
                }}
              >
                {p.permits.some(
                  (x) => x.status === "open" && x.kind !== "other",
                )
                  ? "P"
                  : "•"}
              </button>
            ))}
          <span className="fallback-caption">
            Schematic fallback · use pin controls below
          </span>
        </div>
      )}
      <div className="map-bottomline">
        <span>
          <i className="dot" /> Search radius{" "}
          {(query.radiusMeters / 1609.344).toFixed(1)} mi
        </span>
        <span>
          {synthetic ? "Synthetic positions" : "Official source coordinates"} ·{" "}
          {approvedProvider.kind === "offline" ? (
            "no external tiles"
          ) : approvedProvider.kind === "amazon-location" ? (
            <a
              href="https://docs.aws.amazon.com/location/latest/developerguide/data-attribution.html"
              target="_blank"
              rel="noreferrer"
            >
              Amazon Location data attribution
            </a>
          ) : approvedProvider.id === "openstreetmap-standard" ? (
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          ) : (
            approvedProvider.attribution
          )}
        </span>
      </div>
      {placing && (
        <div className="pin-instruction" role="status">
          {ready || fallback
            ? "Click the map to move your search pin."
            : "The map is loading before you can place your pin."}
        </div>
      )}
    </div>
  );
}
