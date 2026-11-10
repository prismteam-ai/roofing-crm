import { describe, expect, it } from 'vitest';
import { applyDefaults, parseQuestion } from './parse.js';

describe('parseQuestion', () => {
  it('parses the README example', () => {
    const p = parseQuestion(
      'show me open roofing permits older than five years within five miles of Evanston',
    );
    expect(p).toMatchObject({
      radiusMiles: 5,
      minOpenYears: 5,
      openPermits: true,
      place: 'evanston',
    });
  });
  it('parses roof-age queries', () => {
    const p = parseQuestion('Which roofs older than 20 years are within 2 miles of Oak Park?');
    expect(p).toMatchObject({
      radiusMiles: 2,
      minRoofAge: 20,
      openPermits: false,
      place: 'oak park',
    });
  });
  it('leaves unknowns null and applies defaults', () => {
    const p = parseQuestion('find roofing leads near me');
    expect(p.radiusMiles).toBeNull();
    expect(applyDefaults(p)).toEqual({ radiusMiles: 2, minOpenYears: undefined, minRoofAge: 15 });
    expect(applyDefaults(parseQuestion('permits in Chicago'))).toEqual({
      radiusMiles: 2,
      minOpenYears: 5,
      minRoofAge: undefined,
    });
  });
});
