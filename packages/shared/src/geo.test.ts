import { describe, expect, it } from 'vitest';
import { haversineMiles, formatOpenDuration, openDaysToYears } from './geo.js';

describe('haversineMiles', () => {
  it('is zero for identical points', () => {
    expect(haversineMiles(41.84, -87.75, 41.84, -87.75)).toBe(0);
  });
  it('Chicago Loop to Evanston is roughly 12 miles', () => {
    const d = haversineMiles(41.8819, -87.6278, 42.0451, -87.6877);
    expect(d).toBeGreaterThan(11);
    expect(d).toBeLessThan(13);
  });
  it('is symmetric', () => {
    expect(haversineMiles(41, -87, 42, -88)).toBeCloseTo(haversineMiles(42, -88, 41, -87), 9);
  });
});

describe('open duration formatting', () => {
  it('formats days, months, years', () => {
    expect(formatOpenDuration(10)).toBe('10 d');
    expect(formatOpenDuration(200)).toBe('7 mo');
    expect(formatOpenDuration(2000)).toBe('5.5 y');
    expect(formatOpenDuration(null)).toBe('unknown');
  });
  it('converts days to years', () => {
    expect(openDaysToYears(null)).toBeNull();
    expect(openDaysToYears(3653)).toBeCloseTo(10, 1);
  });
});
