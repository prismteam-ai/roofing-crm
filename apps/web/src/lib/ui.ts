import { markerKind, type MarkerKind, type Property } from '@roofing/shared';

export const MARKER_COLORS: Record<MarkerKind, string> = {
  open_permit: '#d7263d',
  old_roof: '#f28c28',
  other: '#6b7280',
};
export const markerColor = (p: Property, minRoofAge: number): string =>
  MARKER_COLORS[markerKind(p, minRoofAge)];

export const fmtDate = (d: string | null): string => (d ? d.slice(0, 10) : 'unknown');
export const fmtMoney = (n: number | null): string =>
  n === null ? 'unknown' : `$${n.toLocaleString('en-US')}`;
export const fmtRoofAge = (
  p: Pick<Property, 'roof_age_years' | 'roof_age_basis' | 'roof_age_confidence'>,
): string =>
  p.roof_age_years === null
    ? 'unknown'
    : `${p.roof_age_years.toFixed(1)} y (${p.roof_age_basis === 'reroof_permit' ? 'last re-roof permit' : 'year built'}, ${p.roof_age_confidence ?? 'unknown'} confidence)`;

export const bbbLabel = (
  c: { bbb_rating: string | null; bbb_state: string } | undefined,
): string => {
  if (!c) return 'BBB: not available';
  if (c.bbb_state === 'confirmed_present' && c.bbb_rating) return `BBB: ${c.bbb_rating}`;
  if (c.bbb_state === 'confirmed_empty') return 'BBB: no rating on file';
  return 'BBB: not available';
};

export const EXAMPLE_PROMPTS = [
  'Show me open roofing permits older than five years within five miles of Evanston',
  'Which roofs older than 20 years are within 2 miles of Oak Park?',
  'Summarize roofing opportunities around the current pin',
];

export const hashPage = (hash: string): 'map' | 'leads' =>
  hash.startsWith('#/leads') ? 'leads' : 'map';
