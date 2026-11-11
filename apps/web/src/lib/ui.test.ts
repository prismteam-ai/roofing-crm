import { describe, expect, it } from 'vitest';
import type { Property } from '@roofing/shared';
import { bbbLabel } from '@roofing/shared';
import {
  agentRetrySeconds,
  fmtMoney,
  fmtRoofAge,
  hashPage,
  markerColor,
  MARKER_COLORS,
  publishedSuffix,
  shortCid,
} from './ui.js';

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
  const T = '2026-11-01T03:12:44Z';
  it('labels BBB honestly', () => {
    expect(bbbLabel(undefined)).toBe('BBB: not available (no contractor match)');
    expect(bbbLabel({ bbb_rating: 'A+', bbb_state: 'confirmed_present', ingested_at: T })).toBe(
      'BBB: A+',
    );
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'confirmed_empty', ingested_at: T })).toBe(
      'BBB: no rating on file',
    );
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'unavailable', ingested_at: T })).toBe(
      'BBB: not available (no public source)',
    );
    expect(bbbLabel({ bbb_rating: null, bbb_state: 'unknown', ingested_at: T })).toBe(
      'BBB: unknown (not checked)',
    );
    expect(bbbLabel({ bbb_rating: 'B', bbb_state: 'stale', ingested_at: T })).toBe(
      'BBB: B (archived copy; capture date unknown; contractor ingested 2026-11-01)',
    );
  });

  it('truncates long CIDs and flags a different published run', () => {
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    expect(shortCid(cid)).toBe('bafy…bzdi');
    expect(shortCid('pending')).toBe('pending');
    expect(publishedSuffix({ runId: 'r1', publishedRunId: 'r1' })).toBe('');
    expect(publishedSuffix({ runId: 'r1', publishedRunId: 'r0' })).toBe(' (published run r0)');
    expect(publishedSuffix(null)).toBe('');
  });
  it('formats money and routes by hash', () => {
    expect(fmtMoney(250000)).toBe('$250,000');
    expect(hashPage('#/leads')).toBe('leads');
    expect(hashPage('')).toBe('map');
  });
});

it('reads finite positive agent retry timing without trusting arbitrary errors', () => {
  expect(agentRetrySeconds({ data: { retryAfterSeconds: 4.2 } })).toBe(5);
  for (const value of [
    null,
    'error',
    {},
    { data: null },
    { data: { retryAfterSeconds: Infinity } },
    { data: { retryAfterSeconds: -1 } },
  ])
    expect(agentRetrySeconds(value)).toBe(0);
});
