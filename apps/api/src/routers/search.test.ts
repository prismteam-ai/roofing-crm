import { describe, expect, it } from 'vitest';
import { loadFixture } from '../dataset/fixture.js';
import { rankForLeads } from './search.js';

const { properties } = loadFixture();
const LOOP = { lat: 41.8781, lon: -87.6298 };

describe('rankForLeads', () => {
  it('toggle off: roof age desc', () => {
    const r = rankForLeads(properties, LOOP, false);
    for (let i = 1; i < r.length; i++)
      expect(r[i - 1]!.roof_age_years ?? -1).toBeGreaterThanOrEqual(r[i]!.roof_age_years ?? -1);
    expect(r).not.toEqual(properties);
  });
  it('toggle on: longest open permit first', () => {
    const r = rankForLeads(properties, LOOP, true);
    const key = (p: (typeof r)[number]) =>
      Math.max(
        0,
        ...p.permits.filter((x) => x.is_roofing && x.status_is_open).map((x) => x.open_days ?? 0),
      );
    for (let i = 1; i < r.length; i++) expect(key(r[i - 1]!)).toBeGreaterThanOrEqual(key(r[i]!));
  });
});
