import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import { COOK_COUNTY_CENTER, DEFAULT_ZOOM, type Property } from '@roofing/shared';
import type { Center } from '../App.js';
import { markerColor } from '../lib/ui.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

interface Props {
  center: Center | null;
  radiusMiles: number;
  properties: Property[];
  minRoofAge: number;
  selected: string | null;
  onPin: (c: Center) => void;
  onSelect: (p: Property) => void;
}

/** GeoJSON circle polygon approximating a radius in miles. */
export function circlePolygon(
  c: Center,
  miles: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const km = miles * 1.609344;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (km / 110.574) * Math.cos(a);
    const dLon = (km / (111.32 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin(a);
    coords.push([c.lon + dLon, c.lat + dLat]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export function MapView({
  center,
  radiusMiles,
  properties,
  minRoofAge,
  selected,
  onPin,
  onSelect,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const pin = useRef<maplibregl.Marker | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ready = useRef(false);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: STYLE_URL,
      center: [COOK_COUNTY_CENTER.lon, COOK_COUNTY_CENTER.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl(), 'top-right');
    m.on('click', (e) =>
      onPinRef.current({ lat: +e.lngLat.lat.toFixed(6), lon: +e.lngLat.lng.toFixed(6) }),
    );
    m.on('load', () => {
      m.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      });
      m.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius',
        paint: { 'line-color': '#2563eb', 'line-width': 2 },
      });
      ready.current = true;
      m.fire('radius-ready');
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      ready.current = false;
    };
  }, []);

  // pin + radius circle
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const draw = () => {
      const src = m.getSource('radius') as GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: center ? [circlePolygon(center, radiusMiles)] : [],
      });
    };
    if (center) {
      if (!pin.current) {
        const e = document.createElement('div');
        e.className = 'pin-marker';
        e.dataset.testid = 'pin-marker';
        pin.current = new maplibregl.Marker({ element: e, anchor: 'bottom' })
          .setLngLat([center.lon, center.lat])
          .addTo(m);
      } else pin.current.setLngLat([center.lon, center.lat]);
      m.easeTo({
        center: [center.lon, center.lat],
        zoom: Math.max(m.getZoom(), 12),
        duration: 500,
      });
    } else {
      pin.current?.remove();
      pin.current = null;
    }
    if (ready.current) draw();
    else m.once('radius-ready', draw);
  }, [center, radiusMiles]);

  // property markers
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const keep = new Set<string>();
    for (const p of properties) {
      keep.add(p.pin14);
      let mk = markers.current.get(p.pin14);
      if (!mk) {
        const e = document.createElement('button');
        e.type = 'button';
        e.className = 'prop-marker';
        e.dataset.testid = 'property-marker';
        e.dataset.pin = p.pin14;
        e.title = p.address ?? p.pin14;
        e.setAttribute('aria-label', `Property ${p.address ?? p.pin14}`);
        mk = new maplibregl.Marker({ element: e, anchor: 'center' })
          .setLngLat([p.lon, p.lat])
          .addTo(m);
        markers.current.set(p.pin14, mk);
      }
      const e = mk.getElement();
      e.style.background = markerColor(p, minRoofAge);
      e.classList.toggle('selected', p.pin14 === selected);
      e.onclick = (ev) => {
        ev.stopPropagation();
        onSelect(p);
      };
    }
    for (const [pin14, mk] of markers.current) {
      if (!keep.has(pin14)) {
        mk.remove();
        markers.current.delete(pin14);
      }
    }
  }, [properties, minRoofAge, selected, onSelect]);

  return (
    <div
      className="map"
      ref={el}
      data-testid="map"
      role="application"
      aria-label="Map of Cook County"
    >
      <div className="legend" data-testid="map-legend">
        <span>
          <i style={{ background: '#d7263d' }} /> open roofing permit
        </span>
        <span>
          <i style={{ background: '#f28c28' }} /> roof ≥ {minRoofAge} y
        </span>
        <span>
          <i style={{ background: '#6b7280' }} /> other match
        </span>
      </div>
    </div>
  );
}
