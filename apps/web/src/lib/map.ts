import type { StyleSpecification } from 'maplibre-gl';

/**
 * Basemap defined inline rather than fetched as a style JSON, so the map has
 * one fewer network dependency at load.
 *
 * Previously Carto's light_all tiles -- verified keyless when this was
 * written, but Carto has since started serving a 200-status "API key
 * required" watermark image in place of real tiles on that anonymous
 * endpoint (caught while reviewing a recorded demo, then confirmed live
 * against the deployed site: a real regression, not a local artifact).
 * OpenStreetMap's own tile server is the standard always-free, no-signup
 * fallback and is keyless/CORS-enabled by design, not by an anonymous grace
 * period that can be revoked the same way.
 */
export const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};
