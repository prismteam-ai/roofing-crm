import type { Lead } from '@roofing-crm/shared';
import { describe, expect, it } from 'vitest';
import { csvCell, leadsToCsv } from './csv.js';
import {
  formatDate,
  formatDateTime,
  formatOpenDuration,
  isPossiblyStale,
  roofAgeText,
  roofBasisText,
  signalKind,
  tidyContractor,
} from './format.js';
import { circlePolygon } from './geo.js';
import { leadFromProperty, priorityForScore } from './leadDraft.js';
import { PROPERTY } from '../test/harness.js';
import { DEFAULT_URL_STATE, parseUrlState, serializeUrlState, type UrlState } from './urlState.js';

describe('URL state', () => {
  it('writes nothing for the defaults', () => {
    expect(serializeUrlState(DEFAULT_URL_STATE)).toBe('');
    expect(parseUrlState('')).toEqual(DEFAULT_URL_STATE);
  });

  it('round-trips every field', () => {
    const state: UrlState = {
      view: 'leads',
      panel: 'agent',
      pin: { lat: 33.1192, lon: -117.0864 },
      radiusMiles: 7.5,
      filters: {
        signal: 'open_permit',
        minRoofAgeYears: 22,
        minOpenYears: 5,
        permitStatus: 'open',
        sort: 'open_days',
      },
      apn: '533-000-12-00',
      leadFilters: {
        status: 'quoted',
        minRoofAgeYears: 30,
        hasOpenPermit: false,
        minOpenYears: 2,
        withinMiles: 3,
      },
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('falls back to defaults for anything invalid or out of range', () => {
    const parsed = parseUrlState(
      '?view=admin&panel=x&lat=abc&lon=-117&r=900&signal=hot&age=-4&open=999&status=maybe&sort=price&apn=%3Cscript%3E&l_status=dead',
    );
    expect(parsed).toEqual({ ...DEFAULT_URL_STATE, radiusMiles: 25 });
  });

  it('drops a pin that is outside the county', () => {
    expect(parseUrlState('?lat=40.7&lon=-74').pin).toBeNull();
  });
});

describe('formatting', () => {
  it('describes open duration in the unit that fits', () => {
    expect(formatOpenDuration(2265)).toBe('open 6.2 yrs');
    expect(formatOpenDuration(240)).toBe('open 8 mo');
    expect(formatOpenDuration(45)).toBe('open 45 days');
    expect(formatOpenDuration(null)).toBe('open, duration unknown');
  });

  it('names the roof-age basis', () => {
    expect(roofBasisText('last_roofing_permit', 2004)).toBe('from 2004 re-roof permit');
    expect(roofBasisText('year_built', 1988)).toBe('year built 1988');
    expect(roofBasisText('unknown', null)).toMatch(/no roof or build year/);
  });

  it('keeps date-only values on their calendar day', () => {
    expect(formatDate('2026-11-23')).toBe('Nov 23, 2026');
    expect(formatDateTime('2026-11-23')).toBe('Nov 23, 2026');
    expect(formatDate(null)).toBe('-');
  });

  it('shows a repeated contractor name once and flags very old open permits', () => {
    expect(tidyContractor('Newel Fasttrack Inc, Newel Fasttrack Inc')).toBe('Newel Fasttrack Inc');
    expect(tidyContractor('Luna Lounge, Denise Luna')).toBe('Luna Lounge, Denise Luna');
    expect(isPossiblyStale(16 * 366)).toBe(true);
    expect(isPossiblyStale(14 * 365)).toBe(false);
    expect(isPossiblyStale(null)).toBe(false);
    expect(roofAgeText(1)).toBe('Roof ~1 yr');
  });

  it('classifies the signal against the chosen threshold', () => {
    expect(signalKind(20, 1, 15)).toBe('both');
    expect(signalKind(20, 0, 15)).toBe('aged');
    expect(signalKind(10, 2, 15)).toBe('permit');
    expect(signalKind(null, 0, 15)).toBe('none');
  });
});

describe('lead drafts', () => {
  it('rebuilds the signal snapshot from a property record', () => {
    const permit = PROPERTY.permits[0];
    const draft = leadFromProperty(PROPERTY, 15, permit);
    expect(draft.permitId).toBe('RF-2020-0042');
    expect(draft.signal).toMatchObject({
      roofAgeYears: 22,
      openRoofPermits: 1,
      longestOpenDays: 2265,
    });
    expect(draft.signal.score).toBeGreaterThanOrEqual(60);
    expect(draft.priority).toBe('high');
    expect(draft.notes).toContain('Acme Roofing');
  });

  it('maps score to a starting priority', () => {
    expect([priorityForScore(10), priorityForScore(30), priorityForScore(60)]).toEqual([
      'low',
      'medium',
      'high',
    ]);
  });
});

describe('CSV export', () => {
  it('quotes separators and defuses spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-117.1)).toBe('-117.1');
    expect(csvCell(null)).toBe('');
  });

  it('writes one line per lead under a header', () => {
    const lead: Lead = {
      leadId: 'lead-1',
      apn: '100-000-01-00',
      permitId: null,
      address: '12 PERMIT LN',
      city: 'SAN DIEGO',
      lat: 32.7,
      lon: -117.1,
      status: 'new',
      priority: 'high',
      assignee: null,
      notes: 'Call after 5, gate code\n1234',
      signal: {
        roofAgeYears: 22,
        roofBasis: 'year_built',
        openRoofPermits: 1,
        longestOpenDays: 900,
        score: 70,
      },
      createdAt: '2026-11-25T18:00:00Z',
      updatedAt: '2026-11-25T18:00:00Z',
    };
    const lines = leadsToCsv([lead]).split('\r\n');
    expect(lines[0]).toMatch(/^lead_id,status,priority,assignee,address/);
    expect(leadsToCsv([lead])).toContain('"Call after 5, gate code\n1234"');
  });
});

describe('search circle', () => {
  it('is a closed ring about one radius from the centre', () => {
    const ring = circlePolygon({ lat: 32.7, lon: -117.1 }, 1).geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(73);
    expect(ring[0]?.[0]).toBeCloseTo(ring.at(-1)?.[0] ?? 0, 9);
    const north = ring[0];
    expect((north?.[1] ?? 0) - 32.7).toBeCloseTo(1 / 69.09, 3);
  });
});
