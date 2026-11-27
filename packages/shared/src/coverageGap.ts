/** Where in a search radius permit data exists, and where it does not (same rule as the oracle server). */
export interface JurisdictionCoverage {
  code: string;
  name: string;
  parcels: number;
  permitFeed: boolean;
}

export interface CoverageGap {
  /** Jurisdiction codes with no permit feed, for shading their city limits on the map. */
  codes: string[];
  /** Their names, for the text. */
  names: string[];
  /** Share of parcels in the radius that sit where permits are published, 0-100. */
  publishedShare: number;
}

/** Matches the server: a few stray parcels coded to another city are not a gap. */
const MATERIAL_SHARE = 0.01;

export function coverageGap(
  coverage: readonly JurisdictionCoverage[] | undefined,
): CoverageGap | null {
  if (!coverage || coverage.length === 0) return null;
  const total = coverage.reduce((sum, j) => sum + j.parcels, 0);
  if (total <= 0) return null;
  const without = coverage.filter((j) => !j.permitFeed && j.parcels / total >= MATERIAL_SHARE);
  if (without.length === 0) return null;
  const covered = coverage.filter((j) => j.permitFeed).reduce((sum, j) => sum + j.parcels, 0);
  return {
    codes: without.map((j) => j.code),
    names: without.map((j) => j.name),
    publishedShare: Math.round((covered / total) * 100),
  };
}

export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The note under an open-permit count when part of the radius has no permit data. */
export function permitGapNote(gap: CoverageGap): string {
  const names = listNames(gap.names);
  return `Shaded grey on the map: the city limits of ${names}. These cities publish no permit data, so open permits there cannot be seen and the real number is higher. A row can still show one of these names as its address: that is the mailing city of a parcel on county land, where the county publishes its permits.`;
}
