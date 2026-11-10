import { describe, expect, it } from 'vitest';
import type { Property } from '@roofing/shared';
import { bbbLabel, fmtMoney, fmtRoofAge, hashPage, markerColor, MARKER_COLORS } from './ui.js';

const base = {
  roof_age_years: 20,
  roof_age_basis: 'year_built',
  roof_age_confidence: 'low',
  permits: [],
} as unknown as Property;

describe('ui helpers', () => {
  it('colours markers by kind', () => {
    expect(markerColor(base, 15)).toBe(MARKER_COLORS.old_roof);
    expect(markerColor({ ...base, roof_age_years: 3 }, 15)).toBe(MARKER_COLORS.other);
  });
  it('formats roof age with basis and confidence', () => {
    expect(fmtRoofAge(base)).toBe('20.0 y (year built, low confidence)');
    expect(fmtRoofAge({ ...base, roof_age_basis: 'new_construction_permit' })).toBe(
      '20.0 y (new-construction permit, low confidence)',
    );
    expect(
      fmtRoofAge({ roof_age_years: null, roof_age_basis: null, roof_age_confidence: null }),
    ).toBe('unknown');
  });
  it('labels BBB honestly', () => {
    expect(bbbLabel(undefined)).toBe('BBB: not available (no contractor match)');
    expect(bbbLabel({ bbb_rating: 'A+', bbb_state: 'confirmed_present' })).toBe('BBB: A+');
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'confirmed_empty' })).toBe(
      'BBB: no rating on file',
    );
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'unavailable' })).toBe(
      'BBB: not available (no public source)',
    );
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'unknown' })).toBe(
      'BBB: not available (no public source)',
    );
    expect(bbbLabel({ bbb_rating: 'B', bbb_state: 'stale' })).toBe('BBB: B (archived copy)');
  });
  it('formats money and routes by hash', () => {
    expect(fmtMoney(250000)).toBe('$250,000');
    expect(hashPage('#/leads')).toBe('leads');
    expect(hashPage('')).toBe('map');
  });
});
