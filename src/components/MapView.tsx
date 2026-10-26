import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { appConfig } from "../config";
import { circleGeoJson } from "../lib/geo";
import type { FC, PermitLead, Pin, Property } from "../lib/types";

interface Props {
  pin: Pin; radiusMiles: number; roofs: Property[]; permits: PermitLead[];
  selectedKey: string | null; onPin: (p: Pin) => void; onSelect: (propertyKey: string) => void;
}

maplibregl.setWorkerUrl(workerUrl);

const empty: FC = { type: "FeatureCollection", features: [] };

function points<T extends { lat: number; lon: number; property_key: string }>(rows: T[], props: (r: T) => Record<string, unknown>): FC {
  return {
    type: "FeatureCollection",
    features: rows.map((r) => ({ type: "Feature", properties: { property_key: r.property_key, ...props(r) }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
  };
}

export default function MapView({ pin, radiusMiles, roofs, permits, selectedKey, onPin, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const ready = useRef(false);
  const cb = useRef({ onPin, onSelect });
  cb.current = { onPin, onSelect };

  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: {
        version: 8,
        sources: { osm: { type: "raster", tiles: [appConfig.tileUrl], tileSize: 256, attribution: "© OpenStreetMap contributors", maxzoom: 19 } },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: appConfig.county.center, zoom: appConfig.county.zoom,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("radius", { type: "geojson", data: empty });
      m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#2563eb", "fill-opacity": 0.07 } });
      m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#2563eb", "line-width": 2 } });
      m.addSource("roofs", { type: "geojson", data: empty });
      m.addLayer({ id: "roofs", type: "circle", source: "roofs", paint: { "circle-radius": 4, "circle-color": "#f59e0b", "circle-stroke-width": 0.5, "circle-stroke-color": "#78350f", "circle-opacity": 0.85 } });
      m.addSource("permits", { type: "geojson", data: empty });
      m.addLayer({ id: "permits", type: "circle", source: "permits", paint: { "circle-radius": ["case", ["==", ["get", "roofing"], true], 9, 7], "circle-color": "#dc2626", "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
      m.addSource("selected", { type: "geojson", data: empty });
      m.addLayer({ id: "selected", type: "circle", source: "selected", paint: { "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 3, "circle-stroke-color": "#1d4ed8" } });
      for (const id of ["roofs", "permits"]) {
        m.on("click", id, (e: maplibregl.MapLayerMouseEvent) => { const k = e.features?.[0]?.properties?.property_key; if (k) cb.current.onSelect(String(k)); });
        m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
      }
      ready.current = true;
      m.fire("data-ready" as never);
    });
    // Dropping a pin: click empty map. Clicks on a point select that property instead.
    m.on("click", (e: maplibregl.MapMouseEvent) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["roofs", "permits"].filter((l) => m.getLayer(l)) });
      if (!hit.length) cb.current.onPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    const mk = new maplibregl.Marker({ color: "#1d4ed8", draggable: true }).setLngLat([pin.lon, pin.lat]).addTo(m);
    mk.on("dragend", () => { const l = mk.getLngLat(); cb.current.onPin({ lat: l.lat, lon: l.lng }); });
    marker.current = mk;
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const apply = () => {
      marker.current?.setLngLat([pin.lon, pin.lat]);
      (m.getSource("radius") as maplibregl.GeoJSONSource).setData(circleGeoJson(pin, radiusMiles));
      (m.getSource("roofs") as maplibregl.GeoJSONSource).setData(points(roofs, () => ({})));
      (m.getSource("permits") as maplibregl.GeoJSONSource).setData(points(permits, (r) => ({ roofing: r.is_roofing })));
      const sel = [...permits, ...roofs].find((r) => r.property_key === selectedKey);
      (m.getSource("selected") as maplibregl.GeoJSONSource).setData(sel ? points([sel], () => ({})) : empty);
    };
    if (ready.current) apply(); else m.once("data-ready" as never, apply);
  }, [pin, radiusMiles, roofs, permits, selectedKey]);

  // Fit the view to the radius when the pin or radius changes.
  useEffect(() => {
    const m = map.current; if (!m) return;
    const dLat = radiusMiles / 69, dLon = radiusMiles / (69 * Math.cos((pin.lat * Math.PI) / 180));
    m.fitBounds([[pin.lon - dLon, pin.lat - dLat], [pin.lon + dLon, pin.lat + dLat]], { padding: 40, duration: 400 });
  }, [pin, radiusMiles]);

  return <div ref={box} className="map" />;
}
