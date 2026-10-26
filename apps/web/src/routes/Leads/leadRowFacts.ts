// Leads table cells (board CrmLeads768): Roof, Main permit and Last activity, read from the
// snapshot `leads.list` returns beside each lead (`signals`, `lastActivity`). Both fields are new
// on the API: a list from an older API, or a lead whose snapshot was never stored, has neither, and
// then every cell says why instead of showing a value (constitution: never invent, show the reason).
import { DAYS_PER_YEAR } from "@crm/domain";
import type { LeadLastActivity, LeadSignals } from "@crm/shared";
import { roofAgeBasisLabel, roofAgeConfidenceLabel } from "../../format/index.js";
import { humanizeCode, permitStatusLabel } from "../../format/labels.js";
import { LEAD_LIST_CAP, LEAD_PAGE_SIZE } from "./leadFilters.state.js";

export const SIGNALS_NOT_SAVED = "Signals not saved for this lead";

const ROOF_BASIS_CODES = ["permit", "new_construction", "built_year", "unknown"] as const;
const ROOF_CONFIDENCE_CODES = ["high", "medium", "low", "none"] as const;

/** One table cell: a main line, an optional second line, optional extra lines. `reason` marks a
 *  missing value whose text is the reason (drawn quieter, never as data). */
export interface FactCell {
  readonly main: string;
  readonly sub?: string;
  readonly extra?: readonly string[];
  readonly reason?: true;
}

/** The roof-age basis as words ("Last reroof permit"); an unknown code is humanized, never raw. */
export function roofBasisText(code: string): string {
  const known = ROOF_BASIS_CODES.find((c) => c === code);
  return known === undefined ? humanizeCode(code) : roofAgeBasisLabel(known);
}

/** `6.4 yrs` from a day count (the age of an open permit). */
export function openYearsText(days: number): string {
  return `${(days / DAYS_PER_YEAR).toFixed(1)} yrs`;
}

type SignalsIn = LeadSignals | null | undefined;

/** Roof: `23 yrs`, the basis in words, and the confidence only when the snapshot stored one. */
export function roofCell(signals: SignalsIn): FactCell {
  if (signals === null || signals === undefined) return { main: SIGNALS_NOT_SAVED, reason: true };
  if (signals.roofAgeYears === undefined) {
    return { main: "Roof age not published for this property", reason: true };
  }
  const confidence = ROOF_CONFIDENCE_CODES.find((c) => c === signals.roofAgeConfidence);
  const parts = [
    signals.roofAgeBasis === undefined ? null : roofBasisText(signals.roofAgeBasis),
    confidence === undefined ? null : roofAgeConfidenceLabel(confidence),
  ].filter((p): p is string => p !== null);
  return {
    main: `${signals.roofAgeYears} yrs`,
    ...(parts.length === 0 ? {} : { sub: parts.join(" · ") }),
  };
}

/** Main permit: `Open n days` (the snapshot keeps the day count and the permit id; the permit class
 *  is shown only when the snapshot stored one, and stalled keeps its "derived" wording), then the
 *  contractor and a BBB rating only when stored. */
export function permitCell(signals: SignalsIn): FactCell {
  if (signals === null || signals === undefined) return { main: SIGNALS_NOT_SAVED, reason: true };
  if (signals.openDays === undefined) {
    return { main: "No open permit when the lead was created", reason: true };
  }
  const statusClass = (signals as { openPermitStatus?: unknown }).openPermitStatus;
  const stalled = statusClass === "stalled";
  const open = `Open ${signals.openDays} days`;
  const tail = [
    openYearsText(signals.openDays),
    signals.openPermitId === undefined ? null : signals.openPermitId,
  ].filter((p): p is string => p !== null);
  const extra = [
    signals.contractor === undefined ? null : signals.contractor,
    signals.bbbRating === undefined ? null : `BBB ${signals.bbbRating}`,
  ].filter((p): p is string => p !== null);
  return {
    main: stalled ? permitStatusLabel("stalled") : open,
    sub: stalled ? [open, ...tail].join(" · ") : tail.join(" · "),
    ...(extra.length === 0 ? {} : { extra }),
  };
}

export interface ActivityCell {
  readonly at: string;
  /** Nothing but the creation: the cell reads "Created <time>". */
  readonly created: boolean;
  readonly text?: string;
}

const ACTIVITY_TEXT = {
  status: "Status changed",
  assignee: "Assignee changed",
  other: "Updated",
} as const;

/** Last activity: the time (UTC) and, for a note, its excerpt. Without the field (older API) or
 *  with only the creation, it reads Created with the stored creation time. */
export function lastActivityCell(
  activity: LeadLastActivity | null | undefined,
  createdAt: string,
): ActivityCell {
  if (activity === null || activity === undefined || activity.kind === "created") {
    return { at: activity?.at ?? createdAt, created: true };
  }
  if (activity.kind === "note") {
    const excerpt = activity.excerpt?.trim();
    return {
      at: activity.at,
      created: false,
      text: excerpt === undefined || excerpt === "" ? "Note added" : `Note: ${excerpt}`,
    };
  }
  return { at: activity.at, created: false, text: ACTIVITY_TEXT[activity.kind] };
}

/** Pages of 25 over the (capped) total; at least one. */
export function totalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(Math.min(totalCount, LEAD_LIST_CAP) / LEAD_PAGE_SIZE));
}

/** The numbered pager: every page when there are few, else first, last and the current one with its
 *  neighbours, `gap` where pages are left out. */
export function pageWindow(current: number, last: number): readonly (number | "gap")[] {
  const wanted = new Set<number>(
    last <= 7
      ? Array.from({ length: last }, (_, i) => i + 1)
      : [1, last, current - 1, current, current + 1],
  );
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    const prev = pages[i - 1];
    if (prev !== undefined && p - prev > 1) out.push("gap");
    out.push(p);
  });
  return out;
}
