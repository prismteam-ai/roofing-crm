import pLimit from 'p-limit';
import { z } from 'zod';
import { withRetry } from '../retry.js';

export const geocodeResultSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  displayName: z.string(),
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
export type Geocoder = (query: string) => Promise<GeocodeResult | null>;

const nominatimRow = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
});

/** Nominatim geocoder: 1 concurrent request (usage policy), cached, retried. */
export function createNominatimGeocoder(fetchFn: typeof fetch = fetch): Geocoder {
  const cache = new Map<string, GeocodeResult | null>();
  const limit = pLimit(1);
  return (query) => {
    const key = query.trim().toLowerCase();
    const hit = cache.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    return limit(async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
      const result = await withRetry(
        async () => {
          const res = await fetchFn(url, {
            headers: {
              'User-Agent': 'roofing-crm/0.1 (assessment demo)',
              Accept: 'application/json',
            },
          });
          if (!res.ok) throw new Error(`nominatim ${res.status}`);
          const rows = z.array(nominatimRow).parse(await res.json());
          const r = rows[0];
          return r ? { lat: r.lat, lon: r.lon, displayName: r.display_name } : null;
        },
        { retries: 2, baseMs: 500 },
      );
      cache.set(key, result);
      return result;
    });
  };
}

/** Offline gazetteer for the agent's no-network mode (Cook County places). */
export const GAZETTEER: Record<string, GeocodeResult> = {
  chicago: { lat: 41.8781, lon: -87.6298, displayName: 'Chicago, IL (offline gazetteer)' },
  evanston: { lat: 42.0451, lon: -87.6877, displayName: 'Evanston, IL (offline gazetteer)' },
  'oak park': { lat: 41.885, lon: -87.7845, displayName: 'Oak Park, IL (offline gazetteer)' },
  cicero: { lat: 41.8456, lon: -87.7539, displayName: 'Cicero, IL (offline gazetteer)' },
  skokie: { lat: 42.0324, lon: -87.7416, displayName: 'Skokie, IL (offline gazetteer)' },
  berwyn: { lat: 41.8506, lon: -87.7937, displayName: 'Berwyn, IL (offline gazetteer)' },
  'the loop': {
    lat: 41.8819,
    lon: -87.6278,
    displayName: 'The Loop, Chicago, IL (offline gazetteer)',
  },
};
export const gazetteerGeocoder: Geocoder = async (q) => GAZETTEER[q.trim().toLowerCase()] ?? null;
