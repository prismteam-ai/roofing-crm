// B-07 T023: lead list URL state (AC-4: filter combinations are shareable and restorable from the
// URL). Same pattern as Map/ExploreFilters.state.ts: parse is total (never throws), values outside
// bounds are dropped rather than clamped into a different question, and `patch` returns a new
// URLSearchParams.
//
// URL keys: `roof` (roofAgeMinYears), `permit` (open|stalled; no "closed": design-review-log row 6,
// the CRM's permit filter is Open / Stalled / Any), `lat`,`lng` (the area center) with `r`
// (radiusMi), `status`, `assignee`, `permitOpen` (years the permit has been open at least: 1, 3, 5
// or 10; sent as days = ceil(years x 365.25)), `page` (1-based; the list's cursor is the numeric offset, so
// page n asks for offset (n - 1) x 25). A legacy `cursor=<offset>` link opens the page it falls in.
// Example: /leads?status=new&assignee=rep%40example.com&roof=20&permit=open&lat=30.5&lng=-97.6&r=10&page=2
import { MAX_RADIUS_MI, MIN_RADIUS_MI, yearsToDays } from "@crm/domain";
import { LEAD_STATUSES, type LeadFilters, type LeadStatus } from "@crm/shared";

export const DEFAULT_LEAD_RADIUS_MI = 5;
export const LEAD_PAGE_SIZE = 25;
/** `leads.list` reads at most this many leads (MAX_LISTED_LEADS on the API): the total is capped. */
export const LEAD_LIST_CAP = 1000;
/** "Permit open >= " presets in years (board CrmLeads768): Any, 1 yr, 3 yrs, 5 yrs, 10 yrs. */
export const PERMIT_OPEN_YEARS = [1, 3, 5, 10] as const;
export type LeadPermitOpenYears = (typeof PERMIT_OPEN_YEARS)[number];
/** The permit filters the CRM offers (design-review-log row 6). `leads.list` also accepts "closed";
 *  the CRM never asks for it, and a `permit=closed` link is read as no permit filter. */
export const PERMIT_STATUSES = ["open", "stalled"] as const;
/** "Within" presets, inside the shared 0.5-25 mi bounds (@crm/domain). */
export const RADIUS_PRESETS_MI: readonly number[] = [0.5, 1, 2, 5, 10, 25];
export type LeadPermitStatus = (typeof PERMIT_STATUSES)[number];

export interface LeadCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface LeadQuery {
  readonly roofAgeMinYears: number | undefined;
  readonly permitStatus: LeadPermitStatus | undefined;
  readonly permitOpenYears: LeadPermitOpenYears | undefined;
  readonly center: LeadCenter | null;
  readonly radiusMi: number;
  readonly status: LeadStatus | undefined;
  readonly assignee: string | undefined;
  /** 1-based page number. */
  readonly page: number;
}

const inRange = (value: number, min: number, max: number): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

function parseNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function parseLeadQuery(params: URLSearchParams): LeadQuery {
  const roof = parseNumber(params.get("roof"));
  const lat = parseNumber(params.get("lat"));
  const lng = parseNumber(params.get("lng"));
  const radius = parseNumber(params.get("r"));
  const permit = params.get("permit");
  const status = params.get("status");
  const assignee = params.get("assignee");
  const permitOpen = parseNumber(params.get("permitOpen"));
  const page = parseNumber(params.get("page"));
  const legacyCursor = parseNumber(params.get("cursor"));
  return {
    roofAgeMinYears: roof !== undefined && Number.isInteger(roof) && roof >= 0 ? roof : undefined,
    permitStatus: PERMIT_STATUSES.find((s) => s === permit),
    permitOpenYears: PERMIT_OPEN_YEARS.find((y) => y === permitOpen),
    center:
      lat !== undefined && lng !== undefined && inRange(lat, -90, 90) && inRange(lng, -180, 180)
        ? { lat, lng }
        : null,
    radiusMi:
      radius !== undefined && inRange(radius, MIN_RADIUS_MI, MAX_RADIUS_MI)
        ? radius
        : DEFAULT_LEAD_RADIUS_MI,
    status: LEAD_STATUSES.find((s) => s === status),
    assignee: assignee === null || assignee.trim() === "" ? undefined : assignee,
    page:
      page !== undefined && Number.isInteger(page) && page >= 1
        ? page
        : legacyCursor !== undefined && Number.isInteger(legacyCursor) && legacyCursor > 0
          ? Math.floor(legacyCursor / LEAD_PAGE_SIZE) + 1
          : 1,
  };
}

export type LeadQueryPatch = Partial<{
  roof: number | null;
  permit: LeadPermitStatus | null;
  permitOpen: LeadPermitOpenYears | null;
  lat: number | null;
  lng: number | null;
  r: number | null;
  status: LeadStatus | null;
  assignee: string | null;
  page: number | null;
}>;

/** Applies a patch (undefined/null removes the key). Any change other than the page itself starts
 *  again from the first page, so a stale page never outlives the filters it belongs to. Page 1 is
 *  the default and leaves no key; an older `cursor` key never survives a patch. */
export function patchLeadParams(params: URLSearchParams, patch: LeadQueryPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  const changesFilters = Object.keys(patch).some((key) => key !== "page");
  if (changesFilters) next.delete("page");
  next.delete("cursor");
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || (key === "page" && value === 1)) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

export interface LeadsListInput {
  readonly filters?: LeadFilters;
  readonly status?: LeadStatus;
  readonly assignee?: string;
  readonly cursor?: string;
  readonly limit: number;
}

/** The `leads.list` input (contracts/leads.md). Radius is only meaningful with a center, so it is
 *  never sent alone. Filters are omitted entirely when none applies. */
export function toLeadsListInput(query: LeadQuery): LeadsListInput {
  const filters: LeadFilters = {
    ...(query.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: query.roofAgeMinYears }),
    ...(query.permitStatus === undefined ? {} : { permitStatus: query.permitStatus }),
    ...(query.permitOpenYears === undefined
      ? {}
      : { permitOpenDaysMin: yearsToDays(query.permitOpenYears) }),
    ...(query.center === null
      ? {}
      : { radiusMi: query.radiusMi, centerLat: query.center.lat, centerLon: query.center.lng }),
  };
  return {
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.assignee === undefined ? {} : { assignee: query.assignee }),
    ...(query.page <= 1 ? {} : { cursor: String((query.page - 1) * LEAD_PAGE_SIZE) }),
    limit: LEAD_PAGE_SIZE,
  };
}

export function hasActiveFilters(query: LeadQuery): boolean {
  return (
    query.roofAgeMinYears !== undefined ||
    query.permitStatus !== undefined ||
    query.permitOpenYears !== undefined ||
    query.center !== null ||
    query.status !== undefined ||
    query.assignee !== undefined
  );
}

/** How many filters are on. The area and its radius are one filter (the radius alone is not). */
export function activeFilterCount(query: LeadQuery): number {
  return [
    query.status !== undefined,
    query.assignee !== undefined,
    query.roofAgeMinYears !== undefined,
    query.permitStatus !== undefined,
    query.permitOpenYears !== undefined,
    query.center !== null,
  ].filter(Boolean).length;
}

/** "Show on map": the map's own URL keys (Map/ExploreFilters.state.ts reads `lat`,`lng`,`r`,
 *  `roof` and `permits=1`, the permit layer). The map has no lead-status, assignee or
 *  permit-status key, so those stay on the list. */
export function leadsMapHref(query: LeadQuery): string {
  const params = new URLSearchParams();
  if (query.center !== null) {
    params.set("lat", String(query.center.lat));
    params.set("lng", String(query.center.lng));
    params.set("r", String(query.radiusMi));
  }
  // The map defaults to roofs of 15+ years, so "no roof filter" on the list is sent as `any`.
  params.set("roof", query.roofAgeMinYears === undefined ? "any" : String(query.roofAgeMinYears));
  if (query.permitStatus !== undefined) params.set("permits", "1");
  const search = params.toString();
  return search === "" ? "/map" : `/map?${search}`;
}
