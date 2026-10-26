// The Atlas data-viz scales the map and its legend share (prototype Explore1440 `bucket`/`durTok`):
// roof age in years → `--viz-roof-age-*`, permit open duration → `--viz-permit-open-*`. Tokens
// are CSS custom-property names; callers use `var(<token>)` in CSS or resolve them for MapLibre.
import { DAYS_PER_YEAR, LONG_OPEN_THRESHOLD_DAYS } from "@crm/domain";

export interface RoofAgeBucket {
  readonly token: string;
  readonly label: string;
  /** Inclusive lower bound, years. */
  readonly min: number;
}

export const ROOF_AGE_BUCKETS: readonly RoofAgeBucket[] = Object.freeze([
  { token: "--viz-roof-age-0-9", label: "0–9", min: 0 },
  { token: "--viz-roof-age-10-14", label: "10–14", min: 10 },
  { token: "--viz-roof-age-15-19", label: "15–19", min: 15 },
  { token: "--viz-roof-age-20-24", label: "20–24", min: 20 },
  { token: "--viz-roof-age-25-plus", label: "25+", min: 25 },
]);

/** The bucket for a roof age, or null when the age is not published. */
export function roofAgeBucket(years: number | null | undefined): RoofAgeBucket | null {
  if (years === null || years === undefined || !Number.isFinite(years)) return null;
  let found: RoofAgeBucket | null = null;
  for (const bucket of ROOF_AGE_BUCKETS) if (years >= bucket.min) found = bucket;
  return found ?? ROOF_AGE_BUCKETS[0] ?? null;
}

export interface PermitOpenBucket {
  readonly token: string;
  readonly label: string;
  /** Inclusive lower bound, days. */
  readonly minDays: number;
}

const YEAR_DAYS = DAYS_PER_YEAR;

export const PERMIT_OPEN_BUCKETS: readonly PermitOpenBucket[] = Object.freeze([
  { token: "--viz-permit-open-lt-1y", label: "<1", minDays: 0 },
  { token: "--viz-permit-open-1-3y", label: "1–3", minDays: YEAR_DAYS },
  { token: "--viz-permit-open-3-5y", label: "3–5", minDays: 3 * YEAR_DAYS },
  { token: "--viz-permit-open-gt-5y", label: "5+", minDays: LONG_OPEN_THRESHOLD_DAYS + 1 },
]);

/** The bucket for a permit's open duration, or null when it is not published. */
export function permitOpenBucket(openDays: number | null | undefined): PermitOpenBucket | null {
  if (openDays === null || openDays === undefined || !Number.isFinite(openDays)) return null;
  let found: PermitOpenBucket | null = null;
  for (const bucket of PERMIT_OPEN_BUCKETS) if (openDays >= bucket.minDays) found = bucket;
  return found ?? PERMIT_OPEN_BUCKETS[0] ?? null;
}
