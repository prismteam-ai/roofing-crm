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
    : `${p.roof_age_years.toFixed(1)} y (${BASIS_LABEL[p.roof_age_basis ?? 'year_built']}, ${p.roof_age_confidence ?? 'unknown'} confidence)`;

const BASIS_LABEL: Record<NonNullable<Property['roof_age_basis']>, string> = {
  reroof_permit: 'last re-roof permit',
  new_construction_permit: 'new-construction permit',
  year_built: 'year built',
};

export const EXAMPLE_PROMPTS = [
  'Show me open roofing permits older than five years within five miles of Evanston',
  'Which roofs older than 20 years are within 2 miles of Oak Park?',
  'Summarize roofing opportunities around the current pin',
  'Which open roofing permits within 2 miles of 2428 W Hutchinson St, Chicago list a contractor with a BBB rating?',
];

/** `bafy…isce` for narrow screens; short values pass through. */
export const shortCid = (cid: string): string =>
  cid.length > 16 ? `${cid.slice(0, 4)}…${cid.slice(-4)}` : cid;

/** "run <runId> (published run <publishedRunId>)" suffix when the served run is not the published one. */
export const publishedSuffix = (m: { runId: string; publishedRunId?: string } | null): string =>
  m?.publishedRunId && m.publishedRunId !== m.runId ? ` (published run ${m.publishedRunId})` : '';

export const hashPage = (hash: string): 'map' | 'leads' =>
  hash.startsWith('#/leads') ? 'leads' : 'map';
