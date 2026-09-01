import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { boundingBox, type LatLon } from '@roofing-crm/shared';
import { BASEMAP_STYLE } from '../lib/map.js';
import { BREVARD } from '../config.js';
import type { LeadCandidate } from '../lib/leads.js';

const TIER_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#2563eb', C: '#d97706', UNKNOWN: '#9ca3af',
};

interface Props {
  center: LatLon | null;
  radiusMiles: number;
  candidates: LeadCandidate[];
  selectedParcelId: string | null;
  onPinDrop: (p: LatLon) => void;
  onSelectCandidate: (parcelId: string) => void;
}

function candidatesGeoJSON(
  candidates: LeadCandidate[],
  selectedParcelId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: candidates.map((c) => ({
      type: 'Feature',
      properties: {
        parcelId: c.parcelId,
        tier: c.tier,
        color: TIER_COLORS[c.tier] ?? TIER_COLORS['UNKNOWN'],
        selected: c.parcelId === selectedParcelId,
      },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  };
}

/** GeoJSON circle approximating the search radius, for the overlay. */
function radiusCircle(center: LatLon, radiusMiles: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const box = boundingBox(center, radiusMiles);
  const latR = (box.maxLat - box.minLat) / 2;
  const lonR = (box.maxLon - box.minLon) / 2;
  const coords: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * 2 * Math.PI;
    coords.push([center.lon + lonR * Math.cos(t), center.lat + latR * Math.sin(t)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}

export function MapView({
  center, radiusMiles, candidates, selectedParcelId, onPinDrop, onSelectCandidate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onPinDropRef = useRef(onPinDrop);
  const onSelectCandidateRef = useRef(onSelectCandidate);
  // Keeps the map's event handlers (registered once, below) calling the latest
  // props without needing onPinDrop/onSelectCandidate in that effect's deps --
  // updated after commit, not during render, so refs stay read-only there.
  useEffect(() => {
    onPinDropRef.current = onPinDrop;
    onSelectCandidateRef.current = onSelectCandidate;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [BREVARD.center.lon, BREVARD.center.lat],
      zoom: BREVARD.defaultZoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    map.on('load', () => {
      map.addSource('search-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'search-radius-fill', type: 'fill', source: 'search-radius',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      });
      map.addLayer({
        id: 'search-radius-line', type: 'line', source: 'search-radius',
        paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      map.addSource('candidates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'candidates-points', type: 'circle', source: 'candidates',
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 8, 5],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1],
          'circle-stroke-color': '#ffffff',
        },
      });
      map.on('mouseenter', 'candidates-points', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'candidates-points', () => { map.getCanvas().style.cursor = ''; });
    });

    map.on('click', 'candidates-points', (e) => {
      const parcelId = e.features?.[0]?.properties?.['parcelId'] as string | undefined;
      if (parcelId) onSelectCandidateRef.current(parcelId);
    });
    // Falls back to a pin drop only when the click missed every candidate marker.
    map.on('click', (e) => {
      const hits = map.getLayer('candidates-points')
        ? map.queryRenderedFeatures(e.point, { layers: ['candidates-points'] })
        : [];
      if (hits.length === 0) onPinDropRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('candidates') as maplibregl.GeoJSONSource | undefined;
      src?.setData(candidatesGeoJSON(candidates, selectedParcelId));
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [candidates, selectedParcelId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource('search-radius') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData(
        center
          ? { type: 'FeatureCollection', features: [radiusCircle(center, radiusMiles)] }
          : { type: 'FeatureCollection', features: [] },
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [center, radiusMiles]);

  return <div className="map" ref={containerRef} role="application" aria-label="Property map" />;
}
