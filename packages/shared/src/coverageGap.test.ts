import { describe, expect, it } from 'vitest';
import { coverageGap, listNames, permitGapNote } from './coverageGap.js';

const elCajon = [
  { code: 'CN', name: 'unincorporated county', parcels: 400, permitFeed: true },
  { code: 'SD', name: 'City of San Diego', parcels: 60, permitFeed: true },
  { code: 'EC', name: 'El Cajon', parcels: 300, permitFeed: false },
  { code: 'LM', name: 'La Mesa', parcels: 200, permitFeed: false },
  { code: 'LG', name: 'Lemon Grove', parcels: 5, permitFeed: false },
];

describe('coverageGap', () => {
  it('lists the cities with no permit feed and the share that is covered', () => {
    const gap = coverageGap(elCajon);
    expect(gap?.codes).toEqual(['EC', 'LM']);
    expect(gap?.publishedShare).toBe(48);
  });

  it('is null when every jurisdiction publishes permits', () => {
    expect(
      coverageGap([{ code: 'SD', name: 'City of San Diego', parcels: 10, permitFeed: true }]),
    ).toBeNull();
    expect(coverageGap(undefined)).toBeNull();
  });

  it('writes a note that names the shaded cities and the mailing-address case', () => {
    const gap = coverageGap(elCajon);
    if (!gap) throw new Error('expected a gap');
    const note = permitGapNote(gap);
    expect(note).toContain('El Cajon and La Mesa');
    expect(note).toContain('mailing city');
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
