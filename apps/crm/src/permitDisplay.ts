/** How the CRM shows permits: labels, the years-to-days conversion and the long-open test. */
import type { DEFAULT_MIN_OPEN_DAYS } from "@oracle-la/api-client";
import type { JoinMethod, PermitStatusClass } from "./permitsApi.ts";

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
/**
 * The default minimum in days (yearsToDays(5)). Its type is the API's DEFAULT_MIN_OPEN_DAYS, so the CRM stops
 * compiling if the API's default changes. The client declares that constant as a type only (no runtime
 * value), so the CRM keeps its own.
 */
export const DEFAULT_MIN_DAYS: typeof DEFAULT_MIN_OPEN_DAYS = 1826;
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
  p: { permit_status_class: PermitStatusClass; open_days: number | null },
  w: OpenWindow,
) =>
  p.permit_status_class === "open-issued" &&
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
export const statusClassLabel = (c: PermitStatusClass) =>
  STATUS_CLASS_LABEL[c] ?? c;

const JOIN_LABEL: Record<string, string> = {
  direct: "direct",
  address: "by address",
  "condo-building": "condo building",
};
export const joinLabel = (j: JoinMethod | null) =>
  j === null ? "not joined" : (JOIN_LABEL[j] ?? j);

/**
 * A roof-age basis label as the API serves it (roof_age_basis): its first word is PERMIT (a finaled roofing
 * permit set the effective roof year) or PROXY (the assessor year built). Shown as "permit" or "year built";
 * undefined for anything else.
 */
export const roofBasisLabel = (basis: unknown) => {
  const word = typeof basis === "string" ? /^[A-Z]+/.exec(basis)?.[0] : "";
  return word === "PERMIT"
    ? "permit"
    : word === "PROXY"
      ? "year built"
      : undefined;
};

/**
 * The roofing flag of a permit as a tag: "roofing", or "roofing (roof coating only)" when only the
 * roof-coating phrase made it roofing work (such a permit never sets the roof year); undefined otherwise.
 */
export const roofingTag = (p: {
  roofing_work: boolean;
  roof_coating_only: boolean;
}) =>
  p.roofing_work
    ? p.roof_coating_only
      ? "roofing (roof coating only)"
      : "roofing"
    : undefined;
