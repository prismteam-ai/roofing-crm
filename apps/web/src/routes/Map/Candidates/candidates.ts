// Candidate model shared by the Candidate list (`/map?view=list`) and Field triage
// (`/map?triage=1`), CRM-HANDOFF §4.3/§4.4. Pure functions only: it joins the map's own
// `search.properties` rows with the `search.permits` rows of the same ring and the caller's lead
// presence (`leads.list`), then sorts. Every value is read verbatim from those responses; nothing
// is derived that the contract does not publish (no address, no contractor name, no BBB score).
import {
  DAYS_PER_YEAR,
  distanceMeters,
  isLongOpen,
  MAX_PERMIT_ROWS,
  METERS_PER_MILE,
  yearsToDays,
  type LatLng,
} from "@crm/domain";
import type { CrmPermit, CrmProperty, Provenanced } from "@crm/index-schema";
import { isLivePermit, mainLeadPermit, permitStatusClassesFor, type LeadStatus } from "@crm/shared";
import {
  permitStatusShortLabel,
  propertySubtitle,
  propertyTitle,
  roofAgeConfidenceLabel,
} from "../../../format/index.js";

export type CandidateSort = "roof" | "open" | "near";
export type PermitStatusFilter = "any" | "open" | "stalled";

/** The map's filters, as the map holds them (URL plus its local permit filters). */
export interface CandidateFilters {
  readonly center: LatLng | null;
  readonly radiusMi: number;
  readonly roofAgeMinYears?: number | undefined;
  /** Owner filter (server-side): tenure of at least this many years. */
  readonly tenureYearsMin?: number | undefined;
  /** Owner filter (server-side): the owner's mailing ZIP is outside the county area. */
  readonly outOfArea?: boolean | undefined;
  readonly permitStatus?: PermitStatusFilter | undefined;
  /** Permit open ≥ N years. */
  readonly permitOpenYrs?: number | undefined;
}

/** What the CRM lead store says about a property (one of the caller's leads). */
export interface CandidateLead {
  readonly leadKey: string;
  readonly leadId: string;
  readonly status: LeadStatus;
}

export type CandidateProperty = Provenanced<CrmProperty>;
export type CandidatePermit = Provenanced<CrmPermit>;

export interface Candidate {
  readonly property: CandidateProperty;
  /** This property's permits in the ring that pass the permit filters. */
  readonly permits: readonly CandidatePermit[];
  /** The main signal's permit: the open or stalled one open longest, else null. */
  readonly mainPermit: CandidatePermit | null;
  readonly distanceMi: number | null;
  /** 8-point compass bearing from the centre, e.g. `SE`. */
  readonly bearing: string | null;
  readonly lead: CandidateLead | null;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** 8-point compass bearing from `from` to `to` (initial great-circle bearing). */
export function compassBearing(from: LatLng, to: LatLng): string {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  const deg = (Math.atan2(y, x) / rad + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8] ?? "N";
}

/** "Open" is open or stalled (a stalled permit is open and not progressing); "Stalled" is stalled
 *  only. The server applies the same definition (`permitStatusClassesFor`). */
function permitPasses(permit: CandidatePermit, filters: CandidateFilters): boolean {
  const status = filters.permitStatus ?? "any";
  if (status === "open" && !isLivePermit(permit)) return false;
  if (status === "stalled" && !(permit.statusClass === "stalled" && isLivePermit(permit)))
    return false;
  if (filters.permitOpenYrs !== undefined) {
    if (permit.openDays === null || permit.openDays / DAYS_PER_YEAR < filters.permitOpenYrs)
      return false;
  }
  return true;
}

/** The `search.permits` input for the map's filters. The server filters (status and open days) and
 *  pages (500 longest open first); the map, the Candidate list and Field triage all build their
 *  input here, so they share one React Query cache entry. */
export function permitQueryInput(
  center: LatLng | null,
  radiusMi: number,
  permitStatus: PermitStatusFilter | undefined,
  permitOpenYrs: number | undefined,
): {
  center: LatLng;
  radiusMi: number;
  sort: "openDays";
  statusClass?: ("open" | "stalled")[];
  openDaysMin?: number;
} {
  const status = permitStatus ?? "any";
  return {
    center: center ?? { lat: 0, lng: 0 },
    radiusMi,
    sort: "openDays",
    ...(status === "any" ? {} : { statusClass: [...(permitStatusClassesFor(status) ?? [])] }),
    // The same cut the map's own "Permit open at least N yrs" filter always made: openDays is a
    // whole number, so at least ceil(N years in days).
    ...(permitOpenYrs === undefined ? {} : { openDaysMin: yearsToDays(permitOpenYrs) }),
  };
}

/** Why lead marks are missing, in words: the presence read failed, or the ring is too big to mark. */
export type LeadsReason = "failed" | "tooMany";

export function leadsNote(reason: LeadsReason | null): string | null {
  if (reason === null) return null;
  return reason === "tooMany"
    ? "More than 1,000 properties are in this ring, so lead marks are not shown; narrow the radius."
    : "Lead marks couldn't be checked for this ring, so some properties already in Leads may not show a Lead pill. Duplicates are still refused on create.";
}

/** The server's permit page ceiling (`search.permits` caps at 500). */
export const PERMIT_PAGE_MAX = MAX_PERMIT_ROWS;

/** The honest line when the server clipped the permits: never a page presented as the whole set. */
export function permitNote(
  page: { total: number; truncated: boolean; shown?: number } | undefined,
): string | null {
  if (page === undefined || !page.truncated) return null;
  return `Showing the ${String(page.shown ?? PERMIT_PAGE_MAX)} longest-open of ${page.total.toLocaleString("en-US")} permits in range; narrow the radius or filters.`;
}

/** True when a permit filter narrows the matches to properties with a matching permit. */
export function hasPermitFilter(filters: CandidateFilters): boolean {
  return (filters.permitStatus ?? "any") !== "any" || filters.permitOpenYrs !== undefined;
}

/** The one `search.properties` input shape, used by the map and the lists so React Query shares one
 *  cache entry. Owner filters are present only when on (an absent key, never `undefined`). */
export function propertiesSearchInput(
  center: LatLng,
  radiusMi: number,
  roofAgeMinYears: number | undefined,
  tenureYearsMin: number | undefined,
  outOfArea: boolean | undefined,
  permitStatus?: PermitStatusFilter | undefined,
  permitOpenYrs?: number | undefined,
) {
  const permitStatusClass = permitStatusClassesFor(permitStatus);
  return {
    center,
    radiusMi,
    roofAgeMinYears,
    ...(tenureYearsMin === undefined ? {} : { tenureYearsMin }),
    ...(outOfArea === true ? { outOfArea: true } : {}),
    // The permit filters travel with the properties request: the server applies them to every
    // property in the circle before the page and the counts, not to the nearest page afterwards.
    ...(permitStatusClass === undefined ? {} : { permitStatusClass }),
    ...(permitOpenYrs === undefined ? {} : { permitOpenDaysMin: yearsToDays(permitOpenYrs) }),
  };
}

/** True when an owner filter (tenure or out-of-area) is on. Applied by the server, unlike permits. */
export function hasOwnerFilter(filters: CandidateFilters): boolean {
  return filters.tenureYearsMin !== undefined || filters.outOfArea === true;
}

/** What "Out-of-area" matches: shown under the chip and in the empty state. It is true whether or
 *  not the index carries the owner mailing ZIPs (contract v1.2). */
export const OUT_OF_AREA_UNPUBLISHED =
  "Out-of-area compares the owner's mailing ZIP with the county; owners with no mailing ZIP on record are not matched.";

/** "tenure 10+ yrs and out-of-area owners" (empty only when no owner filter is on). */
export function ownerFilterPhrase(filters: CandidateFilters): string {
  const parts = [
    filters.tenureYearsMin === undefined ? null : `tenure ${String(filters.tenureYearsMin)}+ yrs`,
    filters.outOfArea === true ? "out-of-area owners" : null,
  ].filter((part): part is string => part !== null);
  return parts.join(" and ");
}

/** What an empty candidate list says: it names what was filtered (the roof age, the permit, or
 *  both), says why when the data cannot satisfy an "open" status, and what to relax. */
export function emptyStateCopy(filters: CandidateFilters): {
  title: string;
  text: string;
  permitFilter: boolean;
  roofFilter: boolean;
  ownerFilter: boolean;
} {
  const roof = filters.roofAgeMinYears;
  const status = filters.permitStatus ?? "any";
  const years = filters.permitOpenYrs;
  const permitFilter = hasPermitFilter(filters);
  const roofFilter = roof !== undefined;
  const ownerFilter = hasOwnerFilter(filters);
  const radius = String(filters.radiusMi);
  const noun =
    status === "open" ? "an open permit" : status === "stalled" ? "a stalled permit" : "a permit";
  const phrase = years === undefined ? noun : `${noun} (open ${String(years)}+ yrs)`;
  if (!permitFilter && ownerFilter) {
    const subject = roofFilter ? `roofs of ${String(roof)}+ yrs` : "properties";
    return {
      title: `No ${subject} with ${ownerFilterPhrase(filters)} within ${radius} mi.`,
      text:
        filters.outOfArea === true
          ? OUT_OF_AREA_UNPUBLISHED
          : `Try a bigger radius${roofFilter ? ", a lower roof age" : ""} or a lower tenure.`,
      permitFilter,
      roofFilter,
      ownerFilter,
    };
  }
  if (!permitFilter) {
    return {
      title: `No roofs match within ${radius} mi.`,
      text: "Try a bigger radius or a lower roof age.",
      permitFilter,
      roofFilter,
      ownerFilter,
    };
  }
  const why =
    status === "open"
      ? "Open includes stalled permits; few properties have one in this data (Austin permits only). "
      : "";
  const title = roofFilter
    ? `No roofs of ${String(roof)}+ yrs have ${phrase} within ${radius} mi.`
    : `No properties with ${phrase} within ${radius} mi.`;
  const ownerUnpublished = filters.outOfArea === true ? `${OUT_OF_AREA_UNPUBLISHED} ` : "";
  return {
    title: ownerFilter ? `${title.slice(0, -1)}, with ${ownerFilterPhrase(filters)}.` : title,
    text: `${ownerUnpublished}${why}Try a bigger radius${roofFilter ? ", a lower roof age" : ""}${ownerFilter ? ", a lower tenure" : ""} or relax the permit filter.`,
    permitFilter,
    roofFilter,
    ownerFilter,
  };
}

/** The header's count: the server's total of matching properties. Every filter, the permit ones
 *  included, is applied by the server before the page is cut, so the total, the list and the map
 *  markers agree (a clipped page says so). */
export function listedCount(
  _filters: CandidateFilters,
  serverTotal: number,
  _rows: number,
): number {
  return serverTotal;
}

/** Index of lead presence by the property's TCAD request identifier (`{fips}:tcad:{id}`). */
export function leadsByRequestIdentifier(
  leads: readonly CandidateLead[],
): ReadonlyMap<string, CandidateLead> {
  const map = new Map<string, CandidateLead>();
  for (const lead of leads) {
    const at = lead.leadKey.indexOf(":tcad:");
    if (at !== -1) map.set(lead.leadKey.slice(at + ":tcad:".length), lead);
  }
  return map;
}

/** Joins properties, permits and lead presence into candidates, in the API's order. */
export function buildCandidates(
  properties: readonly CandidateProperty[],
  permits: readonly CandidatePermit[],
  leads: ReadonlyMap<string, CandidateLead>,
  filters: CandidateFilters,
): Candidate[] {
  const byProperty = new Map<string, CandidatePermit[]>();
  for (const permit of permits) {
    if (!permitPasses(permit, filters)) continue;
    byProperty.set(permit.propertyCid, [...(byProperty.get(permit.propertyCid) ?? []), permit]);
  }
  const out: Candidate[] = [];
  for (const property of properties) {
    const own = byProperty.get(property.propertyCid) ?? [];
    // The server already kept only properties with a matching permit; one whose permit is past
    // the permits page (the 500 longest open) stays listed, just without that permit's detail.
    const mainPermit = mainLeadPermit(own);
    const point =
      property.latitude === null || property.longitude === null
        ? null
        : { lat: property.latitude, lng: property.longitude };
    const center = filters.center;
    out.push({
      property,
      permits: own,
      mainPermit,
      distanceMi:
        center === null || point === null ? null : distanceMeters(center, point) / METERS_PER_MILE,
      bearing: center === null || point === null ? null : compassBearing(center, point),
      lead: leads.get(property.requestIdentifier) ?? null,
    });
  }
  return out;
}

/** CRM-HANDOFF §4.2: a permit filter makes "Permit open (longest)" the default sort. */
export function defaultSort(filters: CandidateFilters): CandidateSort {
  return hasPermitFilter(filters) ? "open" : "roof";
}

export const SORT_LABEL: Readonly<Record<CandidateSort, string>> = {
  roof: "Roof age (oldest)",
  open: "Permit open (longest)",
  near: "Nearest",
};

/** Stable sort; unknown values (null) always go last, never treated as 0. */
export function sortCandidates(list: readonly Candidate[], sort: CandidateSort): Candidate[] {
  const key = (c: Candidate): number | null =>
    sort === "roof"
      ? c.property.roofAgeYears
      : sort === "open"
        ? (c.mainPermit?.openDays ?? null)
        : c.distanceMi;
  const desc = sort !== "near";
  return list
    .map((c, i) => ({ c, i, k: key(c) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const d = desc ? b.k - a.k : a.k - b.k;
      return d === 0 ? a.i - b.i : d;
    })
    .map((x) => x.c);
}

/** `6.4 yrs` from the published `openDays`; never recomputed from dates. */
export function openYearsText(openDays: number | null): string | null {
  if (openDays === null) return null;
  return `${Math.round((openDays / DAYS_PER_YEAR) * 10) / 10} yrs`;
}

/** "Stalled 6.4 yrs · derived: no status in source" / "Open 3.8 yrs" (design-review-log row 6). */
export function permitSignalText(permit: Pick<CrmPermit, "statusClass" | "openDays">): string {
  const years = openYearsText(permit.openDays);
  const head = `${permitStatusShortLabel(permit.statusClass)} ${years ?? "· open duration not published"}`;
  return permit.statusClass === "stalled" ? `${head} · derived: no status in source` : head;
}

/** The main signal for the confirmation sheet: the open or stalled permit, else the roof. */
export function mainSignalText(candidate: Candidate): string {
  if (candidate.mainPermit !== null) return `Permit ${permitSignalText(candidate.mainPermit)}`;
  const { roofAgeYears, roofAgeConfidence } = candidate.property;
  if (roofAgeYears === null) return "Roof age not published";
  return `Roof ${roofAgeYears} yrs · ${roofAgeConfidenceLabel(roofAgeConfidence)} confidence`;
}

export function isLongOpenPermit(permit: CandidatePermit | null): boolean {
  return permit !== null && isLongOpen(permit.openDays);
}

/** "Why is this a lead?" (CRM-HANDOFF §4.3/§4.4): only the conditions the row actually meets. */
export function whyChips(candidate: Candidate, filters: CandidateFilters): string[] {
  const chips: string[] = [];
  const { roofAgeYears, roofAgeConfidence } = candidate.property;
  if (roofAgeYears !== null) {
    const threshold =
      filters.roofAgeMinYears === undefined ? "" : ` ≥ ${String(filters.roofAgeMinYears)}`;
    chips.push(
      `Roof ${roofAgeYears} yrs${threshold} · ${roofAgeConfidenceLabel(roofAgeConfidence)} confidence`,
    );
  }
  if (candidate.mainPermit !== null) chips.push(permitSignalText(candidate.mainPermit));
  if (candidate.distanceMi !== null) {
    chips.push(`${candidate.distanceMi.toFixed(1)} mi ≤ ${String(filters.radiusMi)} mi`);
  }
  return chips;
}

/** The candidate's title: its street address as TCAD prints it, else the TCAD account id. */
export function candidateTitle(property: CandidateProperty): string {
  return propertyTitle(property);
}

/** "TCAD 0206074282 · 30.39655, -97.67912" when the row has an address; else the reason it has
 *  none ("Address not published · …") and the coordinates. */
export function candidateSubtitle(property: CandidateProperty, digits = 5): string {
  const coords =
    property.latitude === null || property.longitude === null
      ? ""
      : ` · ${property.latitude.toFixed(digits)}, ${property.longitude.toFixed(digits)}`;
  return `${propertySubtitle(property)}${coords}`;
}

/** Roof presets shared with the filters (10, 13, 15, 20, 25). */
export const ROOF_PRESETS: readonly number[] = [10, 13, 15, 20, 25];

/** The next lower roof preset, for the empty state's "Roof ≥ M yrs" chip; null if none. */
export function lowerRoofPreset(current: number | undefined): number | null {
  if (current === undefined) return null;
  const lower = ROOF_PRESETS.filter((p) => p < current);
  return lower.length === 0 ? null : (lower[lower.length - 1] ?? null);
}

/** The table/card basis in the boards' short words ("reroof permit", "year built"). */
export function shortBasis(basis: CandidateProperty["roofAgeBasis"]): string {
  switch (basis) {
    case "permit":
      return "reroof permit";
    case "built_year":
      return "year built";
    case "new_construction":
      return "new construction";
    case "unknown":
      return "basis unknown";
  }
}
