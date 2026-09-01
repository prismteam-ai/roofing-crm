import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/agent.js';

const PLACES = ['Merritt Island', 'Cocoa', 'Cocoa Beach', 'Rockledge', 'Palm Bay', 'Melbourne'];

describe('parseIntent', () => {
  it("parses the README's own example question, written in words not digits", () => {
    const intent = parseIntent(
      'open roofing permits older than five years within five miles of Merritt Island',
      PLACES,
    );
    expect(intent.wantsOpenPermits).toBe(true);
    expect(intent.minOpenYears).toBe(5);
    expect(intent.radiusMiles).toBe(5);
    expect(intent.place).toBe('Merritt Island');
    // "permits older than five years" is about the permit's own age, not the roof.
    expect(intent.roofAgeThresholdYears).toBeNull();
  });

  it('parses digit form and a roof-age (not permit) question', () => {
    const intent = parseIntent('roofs older than 20 years within 10 miles of Cocoa', PLACES);
    expect(intent.wantsOpenPermits).toBe(false);
    expect(intent.roofAgeThresholdYears).toBe(20);
    expect(intent.radiusMiles).toBe(10);
    expect(intent.place).toBe('Cocoa');
    expect(intent.minOpenYears).toBeNull();
  });

  it('picks the longer, more specific place match over a shorter substring', () => {
    const intent = parseIntent('any open permits near Cocoa Beach', PLACES);
    expect(intent.place).toBe('Cocoa Beach');
  });

  it('recognises "stalled" as open-more-than-5-years regardless of an explicit number', () => {
    const intent = parseIntent('show me stalled permits near Rockledge', PLACES);
    expect(intent.wantsOpenPermits).toBe(true);
    expect(intent.minOpenYears).toBe(5);
    expect(intent.place).toBe('Rockledge');
  });

  it('returns nulls for a question with no place, radius, or age', () => {
    const intent = parseIntent('what can you tell me about roofing leads', PLACES);
    expect(intent.place).toBeNull();
    expect(intent.radiusMiles).toBeNull();
    expect(intent.roofAgeThresholdYears).toBeNull();
    expect(intent.wantsOpenPermits).toBe(false);
    expect(intent.minOpenYears).toBeNull();
  });

  it('handles a compound number word ("twenty five")', () => {
    const intent = parseIntent('roofs older than twenty five years within Melbourne', PLACES);
    expect(intent.roofAgeThresholdYears).toBe(25);
  });
});
