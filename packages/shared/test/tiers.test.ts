import { describe, expect, it } from 'vitest';
import { classifyTier, isStatusUnconfirmed, leadScore, tenureIsTrustworthy } from '../src/tiers.js';

const base = { roofAgeThreshold: 15, hasOpenRoofingPermit: false } as const;

describe('classifyTier', () => {
  it('puts an open roofing permit in tier A regardless of roof age basis', () => {
    expect(classifyTier({ ...base, hasOpenRoofingPermit: true, roofAgeYears: null, roofAgeBasis: 'UNKNOWN' }))
      .toBe('A');
  });

  it('separates a permit-derived roof age (B) from a building-age proxy (C)', () => {
    expect(classifyTier({ ...base, roofAgeYears: 22, roofAgeBasis: 'PERMIT' })).toBe('B');
    expect(classifyTier({ ...base, roofAgeYears: 22, roofAgeBasis: 'ACT_YR_BLT' })).toBe('C');
  });

  it('never lets an unknown roof age pass the age filter', () => {
    // ~14% of Brevard parcels have no build year at all. A null must not be
    // treated as 0 and quietly satisfy "older than 15 years".
    expect(classifyTier({ ...base, roofAgeYears: null, roofAgeBasis: 'UNKNOWN' })).toBe('UNKNOWN');
  });

  it('excludes properties below the threshold', () => {
    expect(classifyTier({ ...base, roofAgeYears: 5, roofAgeBasis: 'PERMIT' })).toBe('UNKNOWN');
  });
});

describe('leadScore', () => {
  it('ranks an open permit above a permit-derived roof age above a proxy', () => {
    const open = leadScore({ ...base, hasOpenRoofingPermit: true, roofAgeYears: 20, roofAgeBasis: 'PERMIT', permitOpenDays: 400, statusUnconfirmed: false });
    const permitAge = leadScore({ ...base, roofAgeYears: 20, roofAgeBasis: 'PERMIT', permitOpenDays: null, statusUnconfirmed: false });
    const proxy = leadScore({ ...base, roofAgeYears: 20, roofAgeBasis: 'ACT_YR_BLT', permitOpenDays: null, statusUnconfirmed: false });
    expect(open).toBeGreaterThan(permitAge);
    expect(permitAge).toBeGreaterThan(proxy);
  });

  it('rewards longer-open permits, which is the story\'s core signal', () => {
    const mk = (days: number) => leadScore({ ...base, hasOpenRoofingPermit: true, roofAgeYears: 20, roofAgeBasis: 'PERMIT', permitOpenDays: days, statusUnconfirmed: false });
    expect(mk(3650)).toBeGreaterThan(mk(30));
  });

  it('discounts unconfirmed status so it cannot outrank confirmed evidence', () => {
    const args = { ...base, hasOpenRoofingPermit: true, roofAgeYears: 20, roofAgeBasis: 'PERMIT' as const, permitOpenDays: 3650 };
    expect(leadScore({ ...args, statusUnconfirmed: true }))
      .toBeLessThan(leadScore({ ...args, statusUnconfirmed: false }));
  });

  it('stays within 0-100', () => {
    const s = leadScore({ ...base, hasOpenRoofingPermit: true, roofAgeYears: 200, roofAgeBasis: 'PERMIT', permitOpenDays: 100000, statusUnconfirmed: false });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('honesty guards', () => {
  it('treats a missing sale as unknown tenure, not long tenure', () => {
    expect(tenureIsTrustworthy('UNKNOWN_NO_SALE_IN_ROLL')).toBe(false);
    expect(tenureIsTrustworthy(null)).toBe(false);
    expect(tenureIsTrustworthy('FDOR_ROLL_SALE')).toBe(true);
  });

  it('flags UNKNOWN permit status', () => {
    expect(isStatusUnconfirmed('UNKNOWN')).toBe(true);
    expect(isStatusUnconfirmed('OPEN')).toBe(false);
  });
});
