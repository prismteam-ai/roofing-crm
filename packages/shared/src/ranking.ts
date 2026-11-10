import type { Property, Permit } from './schemas.js';

export function openRoofingPermits(p: Property): Permit[] {
  return p.permits.filter((x) => x.is_roofing && x.status_is_open);
}

export function longestOpenDays(p: Property): number {
  return Math.max(0, ...openRoofingPermits(p).map((x) => x.open_days ?? 0));
}

/** Sort: longest open roofing permit first, then roof age desc. */
export function rankProperties(list: Property[]): Property[] {
  return [...list].sort((a, b) => {
    const d = longestOpenDays(b) - longestOpenDays(a);
    if (d !== 0) return d;
    return (b.roof_age_years ?? -1) - (a.roof_age_years ?? -1);
  });
}

export type MarkerKind = 'open_permit' | 'old_roof' | 'other';

export function markerKind(p: Property, minRoofAge: number): MarkerKind {
  if (openRoofingPermits(p).length > 0) return 'open_permit';
  if ((p.roof_age_years ?? 0) >= minRoofAge) return 'old_roof';
  return 'other';
}
