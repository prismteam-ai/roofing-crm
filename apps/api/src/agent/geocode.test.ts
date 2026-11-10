import { describe, expect, it } from 'vitest';
import { createNominatimGeocoder, gazetteerGeocoder } from './geocode.js';

describe('nominatim geocoder', () => {
  it('calls once per query (cache) with a UA header', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/roofing-crm/);
      return new Response(
        JSON.stringify([{ lat: '42.04', lon: '-87.68', display_name: 'Evanston' }]),
      );
    }) as typeof fetch;
    const geocode = createNominatimGeocoder(fetchFn);
    expect(await geocode('Evanston IL')).toEqual({
      lat: 42.04,
      lon: -87.68,
      displayName: 'Evanston',
    });
    expect(await geocode('evanston il')).toEqual({
      lat: 42.04,
      lon: -87.68,
      displayName: 'Evanston',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('countrycodes=us');
  });
  it('returns null when nothing is found', async () => {
    const geocode = createNominatimGeocoder((async () => new Response('[]')) as typeof fetch);
    expect(await geocode('nowhere')).toBeNull();
  });
});

describe('gazetteer', () => {
  it('knows Cook County places', async () => {
    expect((await gazetteerGeocoder('Oak Park'))?.lat).toBeCloseTo(41.885);
    expect(await gazetteerGeocoder('Paris')).toBeNull();
  });
});
