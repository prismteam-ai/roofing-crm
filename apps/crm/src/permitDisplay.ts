/** How the CRM shows permits: labels, the years-to-days conversion and the long-open test. */
import type { JoinMethod, RoofYearBasis, StatusClass } from "./permitsApi.ts";

/**
 * Days per year for every years-to-days conversion (the Julian year: one leap day every four years).
 * A duration of N years is Math.round(N × 365.25) days, e.g. 5 years = 1,826 days.
 */
export const DAYS_PER_YEAR = 365.25;
export const yearsToDays = (years: number) => Math.round(years * DAYS_PER_YEAR);

/** The open-duration window the user set, in whole years: a minimum (default 5) and an optional maximum. */
export interface OpenWindow {
  minYears: number;
  maxYears?: number;
}
export const DEFAULT_WINDOW: OpenWindow = { minYears: 5 };
/** A maximum below the minimum: shown as a validation message, and no call is made. */
export const windowInvalid = (w: OpenWindow) =>
  w.maxYears !== undefined && w.maxYears < w.minYears;
/** A typed whole number of years, at least 1. */
export const wholeYears = (v: string) =>
  Math.max(1, Math.trunc(Number(v)) || 1);

const fmt = (n: number) => n.toLocaleString("en-US");
/** "5 years (1,826 days)". */
export const yearsAndDays = (years: number) =>
  `${years} ${years === 1 ? "year" : "years"} (${fmt(yearsToDays(years))} days)`;
/** An open duration from open_days: "12.3 years (4,500 days)". */
export const openDuration = (days: number) =>
  `${(days / DAYS_PER_YEAR).toFixed(1)} years (${fmt(days)} days)`;

/** A permit is long-open when it is open-issued and its open days are within the window. */
export const isLongOpen = (
  p: { status_class: StatusClass; open_days: number | null },
  w: OpenWindow,
) =>
  p.status_class === "open-issued" &&
  p.open_days !== null &&
  p.open_days >= yearsToDays(w.minYears) &&
  (w.maxYears === undefined || p.open_days <= yearsToDays(w.maxYears));

const STATUS_CLASS_LABEL: Record<string, string> = {
  "open-issued": "Open (issued)",
  "open-application": "Open (application stage)",
  closed: "Closed",
  unclear: "Unclear (neither open nor closed)",
  unmapped: "Unmapped status",
};
/** The label of a status class; a class this CRM does not know yet is shown as it came. */
export const statusClassLabel = (c: StatusClass) => STATUS_CLASS_LABEL[c] ?? c;

const JOIN_LABEL: Record<string, string> = {
  direct: "direct",
  address: "by address",
  "condo-building": "condo building",
};
export const joinLabel = (j: JoinMethod | null) =>
  j === null ? "not joined" : (JOIN_LABEL[j] ?? j);

const BASIS_LABEL: Record<string, string> = {
  permit: "permit",
  year_built: "year built",
};
export const isRoofYearBasis = (v: unknown): v is RoofYearBasis =>
  v === "permit" || v === "year_built";
export const roofYearBasisLabel = (b: RoofYearBasis) => BASIS_LABEL[b] ?? b;
