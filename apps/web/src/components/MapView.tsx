import { DEFAULT_COUNTY, LONG_OPEN_YEARS, type Candidate, type Point } from '@roofing-crm/shared';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { candidateKind, isLongOpen } from '../lib/format.js';
import { circleBounds, circlePolygon, roundCoord, type LngLatBox } from '../lib/geo.js';

export interface MapSelection extends Point {
  apn: string;
  label: string | null;
}

export interface AgentPoint extends Point {
  apn: string;
  label: string | null;
}

export interface MapViewProps {
  pin: Point | null;
  radiusMiles: number;
  candidates: readonly Candidate[];
  roofAgeThreshold: number;
  selected: MapSelection | null;
  agentPoints: readonly AgentPoint[];
  /** One line shown over the map, e.g. how to move the pin on first load. */
  hint?: string | null;
  onPinChange: (point: Point) => void;
  onSelect: (selection: MapSelection) => void;
}

/** Marker colours. Fixed (not themed) so the legend means the same thing in light and dark. */
export const MARKER_COLORS = {
  aged: '#e08a00',
  permit: '#2f6fed',
  both: '#d92d20',
  agent: '#7a4be0',
  none: '#7a8594',
} as const;

const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

/** Used only if the vector basemap cannot be fetched. */
const RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const SRC = {
  radius: 'crm-radius',
  candidates: 'crm-candidates',
  selected: 'crm-selected',
  agent: 'crm-agent',
};
const LAYER = { candidates: 'crm-candidates-dot', agent: 'crm-agent-dot' };

type Features = GeoJSON.FeatureCollection<GeoJSON.Geometry>;
const EMPTY: Features = { type: 'FeatureCollection', features: [] };

function pointFeature(
  point: Point,
  properties: Record<string, string | number | boolean | null>,
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
  };
}

const prefersDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Overlay colours that must contrast with the basemap, which follows the system theme. */
function overlayInk(): { accent: string; ring: string } {
  return prefersDark()
    ? { accent: '#3cc2b0', ring: '#ffffff' }
    : { accent: '#0f6e64', ring: '#111827' };
}

async function resolveStyle(): Promise<string | StyleSpecification> {
  const dark = prefersDark();
  const url = dark ? STYLE_DARK : STYLE_LIGHT;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (response.ok) return url;
  } catch {
    // Fall through to the raster basemap.
  }
  return RASTER_FALLBACK;
}

function setData(map: MapLibreMap, source: string, data: Features): void {
  const target = map.getSource(source);
  if (target) (target as GeoJSONSource).setData(data);
}

function addOverlayLayers(map: MapLibreMap): void {
  const ink = overlayInk();
  for (const id of Object.values(SRC)) map.addSource(id, { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'crm-radius-fill',
    type: 'fill',
    source: SRC.radius,
    paint: { 'fill-color': ink.accent, 'fill-opacity': 0.07 },
  });
  map.addLayer({
    id: 'crm-radius-line',
    type: 'line',
    source: SRC.radius,
    paint: { 'line-color': ink.accent, 'line-width': 2, 'line-dasharray': [3, 2] },
  });
  // Halo for permits open two years or more: bigger and ringed, so they stand out at a glance.
  map.addLayer({
    id: 'crm-candidates-long',
    type: 'circle',
    source: SRC.candidates,
    filter: ['==', ['get', 'longOpen'], true],
    paint: {
      'circle-radius': 13,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.18,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: LAYER.candidates,
    type: 'circle',
    source: SRC.candidates,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'longOpen'], true], 7.5, 5.5],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
  map.addLayer({
    id: LAYER.agent,
    type: 'circle',
    source: SRC.agent,
    paint: {
      'circle-radius': 7,
      'circle-color': MARKER_COLORS.agent,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'crm-selected-ring',
    type: 'circle',
    source: SRC.selected,
    paint: {
      'circle-radius': 17,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': ink.ring,
      'circle-stroke-width': 3,
    },
  });
}

/**
 * The lead map. React owns the data; MapLibre draws it. Markers are one GeoJSON circle layer
 * (not DOM nodes), so 500 candidates stay smooth.
 */
export function MapView(props: MapViewProps) {
  const { pin, radiusMiles, candidates, roofAgeThreshold, selected, agentPoints } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);

  const callbacks = useRef({ onPinChange: props.onPinChange, onSelect: props.onSelect });
  callbacks.current = { onPinChange: props.onPinChange, onSelect: props.onSelect };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let instance: MapLibreMap | null = null;

    void resolveStyle().then((style) => {
      if (cancelled) return;
      try {
        instance = new maplibregl.Map({
          container,
          style,
          center: [DEFAULT_COUNTY.center.lon, DEFAULT_COUNTY.center.lat],
          zoom: DEFAULT_COUNTY.zoom - 1,
          attributionControl: { compact: true },
        });
      } catch {
        setFailed(true);
        return;
      }
      const created = instance;
      created.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      created.on('load', () => {
        if (cancelled) return;
        addOverlayLayers(created);
        setMap(created);
      });
      created.on('click', (event) => {
        // A click on the pin itself is the start of a drag, not a request to move it.
        const target = event.originalEvent.target;
        if (target instanceof Node && markerRef.current?.getElement().contains(target)) return;
        const { x, y } = event.point;
        const hit = created.queryRenderedFeatures(
          [
            [x - 6, y - 6],
            [x + 6, y + 6],
          ],
          { layers: [LAYER.agent, LAYER.candidates] },
        )[0];
        if (hit) {
          const p = hit.properties;
          callbacks.current.onSelect({
            apn: String(p['apn']),
            lat: Number(p['lat']),
            lon: Number(p['lon']),
            label: typeof p['label'] === 'string' ? p['label'] : null,
          });
          return;
        }
        callbacks.current.onPinChange({
          lat: roundCoord(event.lngLat.lat),
          lon: roundCoord(event.lngLat.lng),
        });
      });
      for (const layer of [LAYER.candidates, LAYER.agent]) {
        created.on('mouseenter', layer, () => {
          created.getCanvas().style.cursor = 'pointer';
        });
        created.on('mouseleave', layer, () => {
          created.getCanvas().style.cursor = '';
        });
      }
    });

    return () => {
      cancelled = true;
      markerRef.current = null;
      instance?.remove();
      setMap(null);
    };
  }, []);

  // Search pin: one draggable marker.
  useEffect(() => {
    if (!map) return;
    if (!pin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: true, color: overlayInk().accent });
      marker.getElement().setAttribute('aria-label', 'Search pin. Drag to move the search centre.');
      marker.getElement().setAttribute('data-testid', 'map-pin');
      marker.on('dragend', () => {
        const at = marker.getLngLat();
        callbacks.current.onPinChange({ lat: roundCoord(at.lat), lon: roundCoord(at.lng) });
      });
      marker.setLngLat([pin.lon, pin.lat]).addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([pin.lon, pin.lat]);
    }
  }, [map, pin]);

  // Radius circle, and keep the whole circle in view when the pin or radius changes.
  const pinLat = pin?.lat;
  const pinLon = pin?.lon;
  useEffect(() => {
    if (!map) return;
    if (pinLat === undefined || pinLon === undefined) {
      setData(map, SRC.radius, EMPTY);
      return;
    }
    const center = { lat: pinLat, lon: pinLon };
    setData(map, SRC.radius, {
      type: 'FeatureCollection',
      features: [circlePolygon(center, radiusMiles)],
    });
    map.fitBounds(circleBounds(center, radiusMiles), { padding: 48, maxZoom: 15.5, duration: 600 });
  }, [map, pinLat, pinLon, radiusMiles]);

  // The map's box changes when panels open or the phone rotates: keep the circle framed.
  useEffect(() => {
    const container = containerRef.current;
    if (!map || !container || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (container.clientWidth === 0 || container.clientHeight === 0) return;
        map.resize();
        if (pinLat !== undefined && pinLon !== undefined) {
          map.fitBounds(circleBounds({ lat: pinLat, lon: pinLon }, radiusMiles), {
            padding: 48,
            maxZoom: 15.5,
            duration: 0,
          });
        }
      }, 150);
    });
    observer.observe(container);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [map, pinLat, pinLon, radiusMiles]);

  useEffect(() => {
    if (!map) return;
    setData(map, SRC.candidates, {
      type: 'FeatureCollection',
      features: candidates.map((c) =>
        pointFeature(c, {
          apn: c.apn,
          lat: c.lat,
          lon: c.lon,
          label: c.address,
          color: MARKER_COLORS[candidateKind(c, roofAgeThreshold)],
          longOpen: c.openRoofPermits > 0 && isLongOpen(c.longestOpenDays),
        }),
      ),
    });
  }, [map, candidates, roofAgeThreshold]);

  useEffect(() => {
    if (!map) return;
    setData(map, SRC.agent, {
      type: 'FeatureCollection',
      features: agentPoints.map((p) =>
        pointFeature(p, { apn: p.apn, lat: p.lat, lon: p.lon, label: p.label }),
      ),
    });
    const first = agentPoints[0];
    if (!first) return;
    const box = agentPoints.reduce<LngLatBox>(
      (acc, p) => [
        [Math.min(acc[0][0], p.lon), Math.min(acc[0][1], p.lat)],
        [Math.max(acc[1][0], p.lon), Math.max(acc[1][1], p.lat)],
      ],
      [
        [first.lon, first.lat],
        [first.lon, first.lat],
      ],
    );
    map.fitBounds(box, { padding: 64, maxZoom: 15, duration: 600 });
  }, [map, agentPoints]);

  useEffect(() => {
    if (!map) return;
    setData(map, SRC.selected, {
      type: 'FeatureCollection',
      features: selected ? [pointFeature(selected, { apn: selected.apn })] : [],
    });
    if (selected && !map.getBounds().contains([selected.lon, selected.lat])) {
      map.easeTo({ center: [selected.lon, selected.lat], duration: 500 });
    }
  }, [map, selected]);

  return (
    <div className="map-wrap">
      <div
        ref={containerRef}
        className="map-canvas"
        data-testid="map"
        data-map-ready={map ? 'true' : 'false'}
        role="application"
        aria-label={`Map of ${DEFAULT_COUNTY.name}. Click to drop the search pin.`}
      />
      {failed && (
        <p className="map-overlay map-failed" role="alert">
          The map could not start in this browser (WebGL is unavailable). The list, filters and
          &ldquo;Jump to&rdquo; places still work.
        </p>
      )}
      {!failed && (!pin || props.hint) && (
        <p className="map-overlay map-hint" data-testid="map-hint">
          {pin ? props.hint : 'Click the map to drop a search pin'}
        </p>
      )}
      <MapLegend roofAgeThreshold={roofAgeThreshold} showAgent={agentPoints.length > 0} />
    </div>
  );
}

function Dot({ color, long = false }: { color: string; long?: boolean }) {
  return (
    <span
      className={long ? 'legend-dot legend-dot-long' : 'legend-dot'}
      style={{ background: color, color }}
      aria-hidden="true"
    />
  );
}

export function MapLegend({
  roofAgeThreshold,
  showAgent,
}: {
  roofAgeThreshold: number;
  showAgent: boolean;
}) {
  return (
    <ul className="map-overlay map-legend" aria-label="Map legend" data-testid="map-legend">
      <li>
        <Dot color={MARKER_COLORS.aged} /> Aged roof ({roofAgeThreshold}+ yrs)
      </li>
      <li>
        <Dot color={MARKER_COLORS.permit} /> Open roofing permit
      </li>
      <li>
        <Dot color={MARKER_COLORS.both} /> Both
      </li>
      <li>
        <Dot color={MARKER_COLORS.permit} long /> Ringed: permit open {LONG_OPEN_YEARS}+ yrs
      </li>
      {showAgent && (
        <li>
          <Dot color={MARKER_COLORS.agent} /> Agent result
        </li>
      )}
    </ul>
  );
}
