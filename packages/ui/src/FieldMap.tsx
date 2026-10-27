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
  OFFLINE_BASEMAP,
  validateBasemap,
  type BasemapProvider,
} from "../../map-domain/src/basemap";
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
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  pinRef.current = onPin;
  placeRef.current = placing;
  useEffect(() => {
    if (!container.current) return;
    let mounted = true;
    setReady(false);
    setFallback(false);
    try {
      const instance = new maplibregl.Map({
        container: container.current,
        center: [query.lng, query.lat],
        zoom: 11,
        attributionControl: false,
        style:
          approvedProvider.kind === "raster"
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
              },
      });
      map.current = instance;
      if (approvedProvider.kind === "raster")
        instance.addControl(
          new maplibregl.AttributionControl({ compact: false }),
        );
      instance.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right",
      );
      instance.on("load", () => {
        if (mounted) setReady(true);
      });
      instance.on("click", (e) => {
        if (placeRef.current) pinRef.current(e.lngLat.lat, e.lngLat.lng);
      });
      instance.on("error", () => {
        if (mounted) setFallback(true);
      });
    } catch {
      setFallback(true);
    }
    return () => {
      mounted = false;
      markers.current.forEach((x) => x.remove());
      map.current?.remove();
      map.current = null;
    };
  }, [provider]);
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
    for (const row of rows) {
      if (!row.coordinates) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `property-marker ${selected === row.id ? "selected" : ""}`;
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
      markers.current.push(
        new maplibregl.Marker({ element: button })
          .setLngLat([row.coordinates.lng, row.coordinates.lat])
          .addTo(m),
      );
    }
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
      data-map-renderer={
        fallback || Math.abs(query.lat) > 85
          ? "fallback"
          : ready
            ? "maplibre"
            : "loading"
      }
      aria-label="Map and search area"
    >
      <div ref={container} className="map-canvas" />
      <div className="map-topline">
        <span className="map-label">OAKLAND COUNTY, MI</span>
        <span className="map-label muted">
          {basemap
            ? approvedProvider.kind === "raster"
              ? approvedProvider.attribution
              : "Offline coordinate plot"
            : "Basemap unavailable · points retained"}
        </span>
      </div>

      {(fallback || !ready || Math.abs(query.lat) > 85) && (
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
          {approvedProvider.kind === "offline"
            ? "no external tiles"
            : approvedProvider.attribution}
        </span>
      </div>
      {placing && (
        <div className="pin-instruction" role="status">
          Click the map to move your search pin.
        </div>
      )}
    </div>
  );
}
