import { describe, expect, it } from 'vitest';
import { markerKind, rankProperties } from './ranking.js';
import type { Permit, Property } from './schemas.js';

const permit = (over: Partial<Permit>): Permit => ({
  permit_id: 'P1',
  source_system: 'test',
  pin14: '1',
  address: null,
  permit_type: null,
  work_description: 'REROOF',
  is_roofing: true,
  roofing_match_rule: null,
  status: 'OPEN',
  status_is_open: true,
  issued_at: null,
  applied_at: null,
  closed_at: null,
  open_days: 100,
  contractor_name: null,
  contractor_id: null,
  source_url: null,
  ingested_at: '2026-01-01T00:00:00Z',
  ...over,
});
const prop = (over: Partial<Property>): Property => ({
  pin14: '00000000000000',
  address: 'x',
  city: null,
  zip: null,
  lat: 0,
  lon: 0,
  year_built: null,
  class: null,
  municipality: null,
  owner_name: null,
  mail_address: null,
  mail_city: null,
  mail_state: null,
  mail_zip: null,
  is_out_of_area: false,
  last_sale_date: null,
  last_sale_price: null,
  roof_age_years: null,
  roof_age_basis: null,
  roof_age_confidence: null,
  source_url: null,
  ingested_at: '2026-01-01T00:00:00Z',
  permits: [],
  ...over,
});

describe('rankProperties', () => {
  it('orders by longest open roofing permit, then roof age', () => {
    const a = prop({ pin14: 'a', roof_age_years: 30 });
    const b = prop({ pin14: 'b', roof_age_years: 10, permits: [permit({ open_days: 2000 })] });
    const c = prop({ pin14: 'c', roof_age_years: 40 });
    const d = prop({ pin14: 'd', permits: [permit({ open_days: 50 })] });
    expect(rankProperties([a, b, c, d]).map((p) => p.pin14)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('ignores closed and non-roofing permits', () => {
    const a = prop({
      pin14: 'a',
      roof_age_years: 5,
      permits: [permit({ status_is_open: false, open_days: 9999 })],
    });
    const b = prop({
      pin14: 'b',
      roof_age_years: 6,
      permits: [permit({ is_roofing: false, open_days: 9999 })],
    });
    expect(rankProperties([a, b]).map((p) => p.pin14)).toEqual(['b', 'a']);
  });
});

describe('markerKind', () => {
  it('classifies open permit > old roof > other', () => {
    expect(markerKind(prop({ permits: [permit({})] }), 15)).toBe('open_permit');
    expect(markerKind(prop({ roof_age_years: 20 }), 15)).toBe('old_roof');
    expect(markerKind(prop({ roof_age_years: 3 }), 15)).toBe('other');
  });
});
