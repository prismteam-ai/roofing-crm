import { DEFAULT_ZOOM, type LatLon, type LeadCandidate } from "@crm/shared";
import circle from "@turf/circle";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { AgentResult } from "../../state.tsx";
import { agentFeatures, CANDIDATE_LAYERS, candidateFeatures, LAYER_SPECS, MAP_STYLE } from "./layers.ts";
import { webglAvailable } from "./webgl.ts";

export interface MapViewProps {
  center: LatLon;
  radiusMiles: number;
  candidates: LeadCandidate[];
  onPinDrop(c: LatLon): void;
  selectedId?: string | null;
  onSelect(id: string): void;
  agentResults?: AgentResult[];
  /** Changes when the center was set off-map (GPS, city search, agent): the map re-fits to the radius. */
  fitKey?: number;
}

const radiusShape = (c: LatLon, miles: number) =>
  circle([c.lon, c.lat], miles, { units: "miles", steps: 96 });

function bboxOf(shape: ReturnType<typeof radiusShape>): [[number, number], [number, number]] {
  const ring = shape.geometry.coordinates[0];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/**
 * MapLibre map: radius circle, aged-roof and open-permit markers, the search pin and agent results.
 * Without WebGL it renders a notice instead; the rest of the page keeps working.
 */
export function MapView(props: MapViewProps) {
  const { center, radiusMiles, candidates, selectedId, agentResults = [], fitKey = 0 } = props;
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pinRef = useRef<maplibregl.Marker | null>(null);
  const handlers = useRef(props);
  handlers.current = props;
  const [unavailable, setUnavailable] = useState(() => !webglAvailable());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (unavailable || !el.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: el.current,
        style: MAP_STYLE,
        center: [center.lon, center.lat],
        zoom: DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });
    } catch {
      setUnavailable(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    pinRef.current = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([center.lon, center.lat])
      .addTo(map);
    map.on("load", () => {
      map.addSource("radius", { type: "geojson", data: radiusShape(center, radiusMiles) });
      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "radius-line",
        type: "line",
        source: "radius",
        paint: { "line-color": "#2563eb", "line-width": 1.5 },
      });
      map.addSource("candidates", { type: "geojson", data: candidateFeatures([]) });
      map.addSource("agent", { type: "geojson", data: agentFeatures([]) });
      for (const l of LAYER_SPECS) map.addLayer(l as unknown as maplibregl.LayerSpecification);
      setLoaded(true);
    });
    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: [...CANDIDATE_LAYERS, "agent-results"] });
      const id = hit[0]?.properties?.id;
      if (id !== undefined) handlers.current.onSelect(String(id));
      else handlers.current.onPinDrop({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    for (const layer of [...CANDIDATE_LAYERS, "agent-results"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // The map is created once; later prop changes update its sources below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unavailable]);

  useEffect(() => {
    pinRef.current?.setLngLat([center.lon, center.lat]);
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("radius") as maplibregl.GeoJSONSource | undefined)?.setData(
      radiusShape(center, radiusMiles),
    );
  }, [center, radiusMiles, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitKey === 0) return;
    map.fitBounds(bboxOf(radiusShape(center, radiusMiles)), { padding: 32, duration: 600 });
    // Re-fit only when the center was set off-map (fitKey), not on every radius drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("candidates") as maplibregl.GeoJSONSource | undefined)?.setData(
      candidateFeatures(candidates, selectedId),
    );
  }, [candidates, selectedId, loaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    (map.getSource("agent") as maplibregl.GeoJSONSource | undefined)?.setData(agentFeatures(agentResults));
    if (agentResults.length) {
      const xs = agentResults.map((r) => r.lon);
      const ys = agentResults.map((r) => r.lat);
      map.fitBounds(
        [
          [Math.min(...xs) - 0.01, Math.min(...ys) - 0.01],
          [Math.max(...xs) + 0.01, Math.max(...ys) + 0.01],
        ],
        { padding: 40, duration: 600, maxZoom: 15 },
      );
    }
  }, [agentResults, loaded]);

  if (unavailable) {
    return (
      <div className="map map-unavailable" role="note" data-testid="map-unavailable">
        <strong>Map unavailable in this browser</strong> — results are listed below. Set the search center
        with the city search or the latitude/longitude fields.
      </div>
    );
  }
  return (
    <div ref={el} className="map" data-testid="map" aria-label="Lead map: click to drop the search pin" />
  );
}
