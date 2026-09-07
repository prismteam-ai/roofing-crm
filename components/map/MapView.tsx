"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MlMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OSCEOLA } from "@/lib/config/county";
import { circlePolygon, type LatLng } from "@/lib/queries/geo";
import type { PropertyCandidate } from "@/lib/queries/types";

/** Props for the MapLibre canvas. */
export interface MapViewProps {
  center: LatLng | null;
  radiusMiles: number;
  rows: PropertyCandidate[];
  activeParcelId: string | null;
  selectedIds: ReadonlySet<string>;
  onDropPin: (p: LatLng) => void;
  onSelectParcel: (parcelId: string) => void;
}

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

/** Data-driven marker colour by lead signal (matches the CSS legend variables). */
const SIGNAL_COLOR_EXPR: ExpressionSpecification = [
  "match",
  ["get", "signal"],
  "long_open_permit",
  "#b91c1c",
  "open_permit",
  "#ea580c",
  "aged_roof",
  "#ca8a04",
  "#9ca3af",
];

function toFeatureCollection(
  rows: PropertyCandidate[],
  selected: ReadonlySet<string>,
  active: string | null,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: rows
      .filter((r) => r.lat && r.lng)
      .map((r) => ({
        type: "Feature",
        properties: {
          parcelId: r.parcelId,
          signal: r.signal,
          selected: selected.has(r.parcelId),
          active: r.parcelId === active,
        },
        geometry: { type: "Point", coordinates: [r.lng, r.lat] },
      })),
  };
}

/** MapLibre GL map with OSM raster tiles, click-to-drop pin, radius circle and signal-coloured markers. */
export function MapView({
  center,
  radiusMiles,
  rows,
  activeParcelId,
  selectedIds,
  onDropPin,
  onSelectParcel,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const readyRef = useRef(false);
  const handlersRef = useRef({ onDropPin, onSelectParcel });
  handlersRef.current = { onDropPin, onSelectParcel };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Serve the worker from /public (copied on postinstall); bundlers break the inline worker.
    setWorkerUrl("/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [OSCEOLA.center.lng, OSCEOLA.center.lat],
      zoom: 9.6,
      attributionControl: { compact: false },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");
    map.on("load", () => {
      map.addSource("radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#b45309", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "radius-line",
        type: "line",
        source: "radius",
        paint: { "line-color": "#b45309", "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      map.addSource("candidates", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "candidates",
        type: "circle",
        source: "candidates",
        paint: {
          "circle-radius": [
            "case",
            ["get", "active"],
            9,
            ["get", "selected"],
            7,
            ["==", ["get", "signal"], "aged_roof"],
            4.5,
            6,
          ],
          "circle-color": SIGNAL_COLOR_EXPR,
          "circle-stroke-color": [
            "case",
            ["get", "active"],
            "#111827",
            ["get", "selected"],
            "#1d4ed8",
            "#ffffff",
          ],
          "circle-stroke-width": ["case", ["get", "active"], 2.5, ["get", "selected"], 2, 1],
          "circle-opacity": 0.9,
        },
      });
      map.on("click", "candidates", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const id = f?.properties?.parcelId;
        if (typeof id === "string") handlersRef.current.onSelectParcel(id);
      });
      map.on("mouseenter", "candidates", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "candidates", () => (map.getCanvas().style.cursor = ""));
      map.on("click", (e: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["candidates"] });
        if (hits.length > 0) return;
        handlersRef.current.onDropPin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      readyRef.current = true;
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      (window as Window & { __crmMap?: MlMap }).__crmMap = map; // dev-only inspection hook
    }
    return () => {
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Pin + radius
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("radius") as GeoJSONSource | undefined;
      if (!src) return;
      if (!center) {
        src.setData({ type: "FeatureCollection", features: [] });
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      src.setData({ type: "FeatureCollection", features: [circlePolygon(center, radiusMiles)] });
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#b45309", draggable: true })
          .setLngLat([center.lng, center.lat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current?.getLngLat();
          if (ll) handlersRef.current.onDropPin({ lat: ll.lat, lng: ll.lng });
        });
      } else {
        markerRef.current.setLngLat([center.lng, center.lat]);
      }
      const dLat = radiusMiles / 69.0;
      const dLng = radiusMiles / (69.0 * Math.cos((center.lat * Math.PI) / 180));
      map.fitBounds(
        [
          [center.lng - dLng, center.lat - dLat],
          [center.lng + dLng, center.lat + dLat],
        ],
        { padding: 40, duration: 500, maxZoom: 15 },
      );
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [center, radiusMiles]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource("candidates") as GeoJSONSource | undefined;
      src?.setData(toFeatureCollection(rows, selectedIds, activeParcelId));
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [rows, selectedIds, activeParcelId]);

  // Fly to active parcel
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeParcelId) return;
    const row = rows.find((r) => r.parcelId === activeParcelId);
    if (row && row.lat && row.lng)
      map.easeTo({ center: [row.lng, row.lat], zoom: Math.max(map.getZoom(), 15), duration: 400 });
  }, [activeParcelId, rows]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="application"
      aria-label="Property map"
    />
  );
}
