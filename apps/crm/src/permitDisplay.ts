/** How the CRM shows permits: labels, the years-to-days conversion and the long-open test. */
import type {
  DEFAULT_MIN_OPEN_DAYS,
  MAX_OPEN_DAYS,
} from "@oracle-la/api-client";
import { readNumber, readOptional, type NumberRule } from "./numeric.ts";
import type { JoinMethod, PermitStatusClass } from "./permitsApi.ts";

/**
 * Days per year for every years-to-days conversion (the Julian year: one leap day every four years).
 * A duration of N years is Math.round(N × 365.25) days, e.g. 5 years = 1,826 days.
 */
export const DAYS_PER_YEAR = 365.25;
export const yearsToDays = (years: number) => Math.round(years * DAYS_PER_YEAR);

const fmt = (n: number) => n.toLocaleString("en-US");

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
/** The API's largest open duration in days (typed as the API's constant): 100 years. */
export const MAX_DAYS: typeof MAX_OPEN_DAYS = 36_525;
export const MAX_YEARS = 100;

/** The window's fields as typed (read by readWindow when the list and the map ask for it). */
export interface WindowText {
  minYears: string;
  maxYears: string;
}
export const DEFAULT_WINDOW_TEXT: WindowText = {
  minYears: String(DEFAULT_WINDOW.minYears),
  maxYears: "",
};
const MIN_YEARS_RULE: NumberRule = {
  label: "Open at least (years)",
  min: 1,
  max: MAX_YEARS,
  whole: true,
};
const MAX_YEARS_RULE: NumberRule = {
  label: "At most (years, optional)",
  min: 1,
  max: MAX_YEARS,
  whole: true,
};
/**
 * The window of the typed fields, or the message to show (then no call is made and the map keeps its last
 * valid window): an empty or invalid field, or a maximum below the minimum.
 */
export function readWindow(
  t: WindowText,
):
  | { window: OpenWindow; error?: undefined }
  | { window?: undefined; error: string } {
  const min = readNumber(t.minYears, MIN_YEARS_RULE);
  const max = readOptional(t.maxYears, MAX_YEARS_RULE);
  const errors = [min, max].flatMap((r) => ("error" in r ? [r.error] : []));
  if ("error" in min || "error" in max) return { error: errors.join(" ") };
  if (max.value !== undefined && max.value < min.value)
    return {
      error: `The maximum (${max.value} years) is below the minimum (${min.value} years); set a larger maximum or clear it.`,
    };
  return {
    window: {
      minYears: min.value,
      ...(max.value === undefined ? {} : { maxYears: max.value }),
    },
  };
}
/** The window in days as the API takes it (min_open_days; max_open_days only when set). */
export const windowDays = (
  w: OpenWindow,
): { min_open_days: number; max_open_days?: number } => ({
  min_open_days: yearsToDays(w.minYears),
  ...(w.maxYears === undefined
    ? {}
    : { max_open_days: yearsToDays(w.maxYears) }),
});
/**
 * The window in days as a stable string key, "min|max" (max "" when unset): "1826|" by default. The long-open
 * list and the map highlight send the same days.
 */
export const windowKey = (w: OpenWindow) => {
  const d = windowDays(w);
  return `${d.min_open_days}|${d.max_open_days ?? ""}`;
};
/** The days of a windowKey, as the API takes them. */
export const daysOfKey = (
  key: string,
): { min_open_days: number; max_open_days?: number } => {
  const [min, max] = key.split("|");
  return {
    min_open_days: Number(min),
    ...(max ? { max_open_days: Number(max) } : {}),
  };
};
/** An open-duration window in days: "open at least 1,826 days" or "open 1,826 to 3,653 days". */
export const openDaysText = (min: number, max: number | null | undefined) =>
  max === null || max === undefined
    ? `open at least ${fmt(min)} days`
    : `open ${fmt(min)} to ${fmt(max)} days`;
/** "5 years (1,826 days)". */
export const yearsAndDays = (years: number) =>
  `${years} ${years === 1 ? "year" : "years"} (${fmt(yearsToDays(years))} days)`;
/** An open duration from open_days: "12.3 years (4,500 days)". */
export const openDuration = (days: number) =>
  `${(days / DAYS_PER_YEAR).toFixed(1)} years (${fmt(days)} days)`;

/**
 * A permit is long-open when it is roofing work, open-issued and its open days are within the window: the
 * data API's rule for permits.longOpen and the map highlight (a permit that is not roofing work never counts).
 */
export const isLongOpen = (
  p: {
    permit_status_class: PermitStatusClass;
    open_days: number | null;
    roofing_work: boolean;
  },
  w: OpenWindow,
) =>
  p.roofing_work &&
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
/**
 * The tag of a row in the long-open roofing list, which the server limits to roofing work: only what sets a
 * row apart. "roof coating only" when only the roof-coating phrase made it roofing work; "not roofing work"
 * should an API without the roofing filter send such a row; undefined for plain roofing work.
 */
export const longOpenTag = (p: {
  roofing_work: boolean;
  roof_coating_only: boolean;
}) =>
  !p.roofing_work
    ? "not roofing work"
    : p.roof_coating_only
      ? "roof coating only"
      : undefined;
