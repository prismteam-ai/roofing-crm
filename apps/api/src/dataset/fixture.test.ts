import { describe, expect, it } from 'vitest';
import { haversineMiles } from '@roofing/shared';
import { FixtureDatasetClient, filterProperties, loadFixture } from './fixture.js';

const { properties, info } = loadFixture();
const LOOP = { lat: 41.8781, lon: -87.6298 };

describe('fixture dataset', () => {
  it('has ~300 contract-valid rows with open roofing permits', () => {
    expect(properties.length).toBe(300);
    expect(info.counts.property).toBe(300);
    const open = properties
      .flatMap((p) => p.permits)
      .filter((x) => x.is_roofing && x.status_is_open);
    expect(open.length).toBeGreaterThan(50);
    expect(open.every((x) => x.closed_at === null && (x.open_days ?? 0) > 0)).toBe(true);
  });
  it('every closed permit has closed_at and open permits have none', () => {
    for (const x of properties.flatMap((p) => p.permits)) {
      expect(x.status_is_open).toBe(x.closed_at === null);
    }
  });
});

describe('filterProperties', () => {
  it('respects radius', () => {
    const r = filterProperties(properties, { ...LOOP, radiusMiles: 1 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => haversineMiles(LOOP.lat, LOOP.lon, p.lat, p.lon) <= 1)).toBe(true);
    expect(filterProperties(properties, { ...LOOP, radiusMiles: 10 }).length).toBeGreaterThan(
      r.length,
    );
  });
  it('applies min roof age', () => {
    const r = filterProperties(properties, { ...LOOP, radiusMiles: 10, minRoofAge: 50 });
    const noOpen = r.filter((p) => !p.permits.some((x) => x.is_roofing && x.status_is_open));
    expect(noOpen.every((p) => (p.roof_age_years ?? 0) >= 50)).toBe(true);
  });
  it('open permits only + min open days', () => {
    const r = filterProperties(properties, {
      ...LOOP,
      radiusMiles: 10,
      openRoofingPermitsOnly: true,
      minOpenDays: 1826,
    });
    expect(r.length).toBeGreaterThan(0);
    for (const p of r) {
      const longest = Math.max(
        ...p.permits.filter((x) => x.is_roofing && x.status_is_open).map((x) => x.open_days ?? 0),
      );
      expect(longest).toBeGreaterThanOrEqual(1826);
    }
  });
  it('sorts by open days desc then roof age and honours limit', () => {
    const r = filterProperties(properties, { ...LOOP, radiusMiles: 10, limit: 5 });
    expect(r.length).toBe(5);
    const key = (p: (typeof r)[number]) =>
      Math.max(
        0,
        ...p.permits.filter((x) => x.is_roofing && x.status_is_open).map((x) => x.open_days ?? 0),
      );
    for (let i = 1; i < r.length; i++) expect(key(r[i - 1]!)).toBeGreaterThanOrEqual(key(r[i]!));
  });
  it('rejects invalid input', () => {
    expect(() =>
      filterProperties(properties, { lat: 'x' as unknown as number, lon: 0, radiusMiles: 1 }),
    ).toThrow();
  });
});

describe('FixtureDatasetClient', () => {
  const client = new FixtureDatasetClient();
  it('reports fixture info', async () => {
    const i = await client.getDatasetInfo();
    expect(i.client).toBe('fixture');
    expect(i.runId).toMatch(/fixture/);
    expect(i.limitations.length).toBeGreaterThan(0);
  });
  it('gets a property by pin and null for unknown', async () => {
    const pin = properties[0]!.pin14;
    expect((await client.getProperty(pin)).property?.pin14).toBe(pin);
    expect((await client.getProperty('00000000000000')).property).toBeNull();
  });
  it('queryDataset is a no-op', async () => {
    expect(await client.queryDataset('select 1')).toEqual({
      columns: [],
      rows: [],
      truncated: false,
    });
  });
});
