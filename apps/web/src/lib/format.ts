import { LONG_OPEN_YEARS, type Candidate, type RoofBasis } from '@roofing-crm/shared';

const DAYS_PER_YEAR = 365.25;

export const openYears = (days: number): number => days / DAYS_PER_YEAR;

export const isLongOpen = (days: number | null): boolean =>
  days !== null && openYears(days) >= LONG_OPEN_YEARS;

/** "open 6.2 yrs", "open 8 mo", "open 45 days". */
export function formatOpenDuration(days: number | null): string {
  if (days === null) return 'open, duration unknown';
  if (days >= DAYS_PER_YEAR) return `open ${openYears(days).toFixed(1)} yrs`;
  if (days >= 60) return `open ${String(Math.round(days / 30.44))} mo`;
  return `open ${String(days)} ${days === 1 ? 'day' : 'days'}`;
}

export function formatMiles(miles: number): string {
  return `${miles < 10 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
}

/** Says where a roof year came from: a permit date and a build year are not equal evidence. */
export function roofBasisText(basis: RoofBasis, roofYear: number | null): string {
  switch (basis) {
    case 'last_roofing_permit':
      return roofYear === null
        ? 'from last re-roof permit'
        : `from ${String(roofYear)} re-roof permit`;
    case 'year_built':
      return roofYear === null ? 'from year built' : `year built ${String(roofYear)}`;
    case 'unknown':
      return 'no roof or build year in source data';
  }
}

export function roofAgeText(years: number | null): string {
  if (years === null) return 'Roof age unknown';
  return `Roof ~${String(years)} ${years === 1 ? 'yr' : 'yrs'}`;
}

/** County records hold permits that were issued decades ago and never finalled. */
export const STALE_OPEN_YEARS = 15;

export const isPossiblyStale = (days: number | null): boolean =>
  days !== null && openYears(days) > STALE_OPEN_YEARS;

export const STALE_HINT =
  `Open for more than ${String(STALE_OPEN_YEARS)} years. The permit may simply never have been ` +
  'finalled in the county records, so check before treating it as an unfinished job.';

const DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const SHORT_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Compact timestamp for table cells: "Nov 25, 10:20 AM". The full value belongs in a title. */
export function formatShortDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : SHORT_DATE_TIME.format(date);
}

/** Date-only strings are shown as that calendar day (no time-zone shift). */
export function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : DATE.format(date);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME.format(date);
}

export const formatCount = (n: number): string => n.toLocaleString('en-US');

export type SignalKind = 'both' | 'permit' | 'aged' | 'none';

export function signalKind(
  roofAgeYears: number | null,
  openRoofPermits: number,
  roofAgeThreshold: number,
): SignalKind {
  const aged = roofAgeYears !== null && roofAgeYears >= roofAgeThreshold;
  const permit = openRoofPermits > 0;
  if (aged && permit) return 'both';
  if (permit) return 'permit';
  return aged ? 'aged' : 'none';
}

export const candidateKind = (c: Candidate, roofAgeThreshold: number): SignalKind =>
  signalKind(c.roofAgeYears, c.openRoofPermits, roofAgeThreshold);

/**
 * Permit records often repeat one party as both firm and contact ("Acme Inc, Acme Inc").
 * Show each distinct name once.
 */
export function tidyContractor(name: string): string {
  const seen = new Set<string>();
  return name
    .split(',')
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (part === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

export function addressLine(address: string | null, apn: string): string {
  return address ?? `APN ${apn} (no address in source data)`;
}

/** A readable message for any thrown value; network failures get a hint about the API. */
export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return 'Cannot reach the API. Check that it is running and that VITE_API_URL is correct.';
  }
  return message || 'Something went wrong.';
}
