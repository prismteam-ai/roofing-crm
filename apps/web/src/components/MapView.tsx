import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { boundingBox, type LatLon } from '@roofing-crm/shared';
import { BASEMAP_STYLE } from '../lib/map.js';
import { BREVARD } from '../config.js';

interface Props {
  center: LatLon | null;
  radiusMiles: number;
  onPinDrop: (p: LatLon) => void;
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

export function MapView({ center, radiusMiles, onPinDrop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onPinDropRef = useRef(onPinDrop);
  onPinDropRef.current = onPinDrop;

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
    });

    map.on('click', (e) => onPinDropRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

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
