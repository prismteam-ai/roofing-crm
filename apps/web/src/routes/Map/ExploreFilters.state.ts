// B-03 Map URL state (plan.md "Patterns the code must show": "radius/threshold/permit-view are
// shareable and restorable from the URL"). Replaces the A-13/ORACLE-u Explore-page version this
// file was copied from (C1 copy, 2026-10-23): that version's `place`/`tenure`/`ooa`/`sort`/
// gazetteer machinery belongs to Task A's place-based Explorer, not this story's pin/GPS +
// radius Map (no place search). The owner filters came back later (Task A's "Owner" group):
// `tenure` and `ooa`, parsed exactly like `roof`. Kept: the URL-param pattern itself and the
// file's location/name (tasks.md T023a).
//
// URL keys: `lat`,`lng` (the search center pin/GPS point), `r` (radiusMi, 0.5-25),
// `roof` (roofAgeMinYears; PO decision 2026-10-26: absent = DEFAULT_ROOF_AGE_YEARS (15), `any` =
// no roof filter, a whole number = that threshold), `tenure` (tenureYearsMin, whole years 0-100), `ooa` (out-of-area
// owner, "1" or "true"), `permit` (permit status filter, "open" or "stalled"; absent = any),
// `permitYrs` (permit open at least this many whole years, 0-100), `permits` (permit-view toggle,
// "1"), `sel` (the selected
// propertyCid, opens the detail drawer). Values outside bounds are dropped, never clamped into a
// different question (FR-001/FR-003, matching the pattern the original file used).
import {
  DEFAULT_RADIUS_MI,
  DEFAULT_ROOF_AGE_YEARS,
  MAX_RADIUS_MI,
  MIN_RADIUS_MI,
} from "@crm/domain";

export { DEFAULT_RADIUS_MI, DEFAULT_ROOF_AGE_YEARS };
/** The URL value that means "no roof-age filter" (an explicit choice that survives reload). */
export const ROOF_ANY = "any";
export const RADIUS_BOUNDS: readonly [number, number] = [MIN_RADIUS_MI, MAX_RADIUS_MI];
/** Upper bound of the owner-tenure filter (years); a value above it is dropped, not clamped. */
export const MAX_TENURE_YEARS = 100;

export type PermitStatusParam = "open" | "stalled" | "any";

export interface MapCenter {
  readonly lat: number;
  readonly lng: number;
}

export interface MapQuery {
  readonly center: MapCenter | null;
  readonly radiusMi: number;
  readonly roofAgeMinYears: number | undefined;
  /** Owner filter: years since the latest dated sale, at least this many. */
  readonly tenureYearsMin: number | undefined;
  /** Owner filter: the owner's mailing ZIP is outside the Travis County area. */
  readonly outOfArea: boolean;
  /** Permit status filter; "any" when the URL has none. */
  readonly permitStatus: PermitStatusParam;
  /** Permit filter: open at least this many years. */
  readonly permitOpenYrs: number | undefined;
  readonly permitView: boolean;
  readonly sel: string | null;
}

const inRange = (value: number, [min, max]: readonly [number, number]): boolean =>
  Number.isFinite(value) && value >= min && value <= max;

function parseCenter(params: URLSearchParams): MapCenter | null {
  const lat = params.get("lat");
  const lng = params.get("lng");
  if (lat === null || lng === null) return null;
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!inRange(latNum, [-90, 90]) || !inRange(lngNum, [-180, 180])) return null;
  return { lat: latNum, lng: lngNum };
}

function parseRadius(params: URLSearchParams): number {
  const raw = params.get("r");
  if (raw === null || raw.trim() === "") return DEFAULT_RADIUS_MI;
  const value = Number(raw);
  return inRange(value, RADIUS_BOUNDS) ? value : DEFAULT_RADIUS_MI;
}

function parseRoofAgeMinYears(params: URLSearchParams): number | undefined {
  const raw = params.get("roof");
  // Absent (or blank) is the default question: roofs of 15 years or more (README, PO 2026-10-26).
  if (raw === null || raw.trim() === "") return DEFAULT_ROOF_AGE_YEARS;
  if (raw.trim().toLowerCase() === ROOF_ANY) return undefined;
  const value = Number(raw);
  // A value that is not a whole number >= 0 is dropped, never clamped into a different question:
  // it falls back to the default, exactly what an absent param means.
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_ROOF_AGE_YEARS;
}

function parseTenureYearsMin(params: URLSearchParams): number | undefined {
  const raw = params.get("tenure");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  // Dropped (no filter) when not a whole number in 0-100, never clamped.
  return Number.isInteger(value) && value >= 0 && value <= MAX_TENURE_YEARS ? value : undefined;
}

function parseOutOfArea(params: URLSearchParams): boolean {
  const raw = params.get("ooa");
  return raw === "1" || raw === "true";
}

function parsePermitStatus(params: URLSearchParams): PermitStatusParam {
  const raw = params.get("permit");
  return raw === "open" || raw === "stalled" ? raw : "any";
}

function parsePermitOpenYrs(params: URLSearchParams): number | undefined {
  const raw = params.get("permitYrs");
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  // Dropped (no filter) when not a whole number in 0-100, never clamped.
  return Number.isInteger(value) && value >= 0 && value <= MAX_TENURE_YEARS ? value : undefined;
}

export function parseMapQuery(params: URLSearchParams): MapQuery {
  return {
    center: parseCenter(params),
    radiusMi: parseRadius(params),
    roofAgeMinYears: parseRoofAgeMinYears(params),
    tenureYearsMin: parseTenureYearsMin(params),
    outOfArea: parseOutOfArea(params),
    permitStatus: parsePermitStatus(params),
    permitOpenYrs: parsePermitOpenYrs(params),
    permitView: params.get("permits") === "1",
    sel: params.get("sel"),
  };
}

export type MapQueryPatch = Partial<{
  lat: number | null;
  lng: number | null;
  r: number | null;
  /** A threshold, "any" (explicit no filter) or null (remove the key: the default of 15). */
  roof: number | typeof ROOF_ANY | null;
  tenure: number | null;
  ooa: boolean | null;
  permit: "open" | "stalled" | null;
  permitYrs: number | null;
  permits: boolean | null;
  sel: string | null;
}>;

/** Applies a patch of URL values (undefined/null/false removes the key). */
export function patchMapParams(params: URLSearchParams, patch: MapQueryPatch): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === false) next.delete(key);
    else next.set(key, value === true ? "1" : String(value));
  }
  return next;
}

/** Owner filters reach `search.properties` only; the county overview is not filtered by them. */
export const OWNER_OVERVIEW_NOTE = "Owner filters apply once you pick an area";
/** The overview's `matched` counts roof age and usage only; permit status and open-years narrow the
 *  permit points, not the property total. So with no centre it must not print a county number. */
export const PERMIT_OVERVIEW_NOTE =
  "Choose a centre or drop a pin to search permits. The county overview can't count permit filters";
/** The line that stands in for the county count when a filter it cannot apply is active. */
export function overviewFilterNote(
  permitActive: boolean,
  ownerActive: boolean,
): string | undefined {
  if (permitActive) return PERMIT_OVERVIEW_NOTE;
  return ownerActive ? OWNER_OVERVIEW_NOTE : undefined;
}

/** One tap that sets the roof, permit and owner filters together. Each preset names every one of
 *  those filters, so applying it replaces whatever was set before (the place and radius are not
 *  touched). Modelled on CountyLens's Filters tab "Suggestions" (the PO's reference); every
 *  criterion is a filter this panel already has, none is new. */
export interface FilterPreset {
  readonly id: string;
  /** Plain words, naming the criteria. */
  readonly label: string;
  /** A threshold, or `ROOF_ANY` (an explicit "no roof filter"). */
  readonly roof: number | typeof ROOF_ANY;
  /** "open" includes stalled (a stalled permit is an open one that is not progressing). */
  readonly permit: "open" | "stalled" | null;
  readonly permitYrs: number | null;
  readonly tenure: number | null;
  readonly ooa: boolean;
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  {
    id: "old-roof-live-permit",
    label: "Roofs 20+ years, open or stalled permit",
    roof: 20,
    permit: "open",
    permitYrs: null,
    tenure: null,
    ooa: false,
  },
  {
    id: "long-open-permit",
    label: "Open permit for 5+ years, roof 15+",
    roof: 15,
    permit: "open",
    permitYrs: 5,
    tenure: null,
    ooa: false,
  },
  {
    id: "out-of-area-old-roof",
    label: "Out-of-area owners, roof 20+",
    roof: 20,
    permit: null,
    permitYrs: null,
    tenure: null,
    ooa: true,
  },
  {
    id: "long-tenure",
    label: "Owners for 10+ years, roof 15+",
    roof: 15,
    permit: null,
    permitYrs: null,
    tenure: 10,
    ooa: false,
  },
  {
    id: "stalled-3yrs",
    label: "Stalled permits for 3+ years",
    roof: ROOF_ANY,
    permit: "stalled",
    permitYrs: 3,
    tenure: null,
    ooa: false,
  },
  {
    id: "oldest-roofs",
    label: "Roofs 25+ years",
    roof: 25,
    permit: null,
    permitYrs: null,
    tenure: null,
    ooa: false,
  },
];

/** The URL patch that applies a preset: every roof/permit/owner key is written or removed. */
export function presetPatch(preset: FilterPreset): MapQueryPatch {
  return {
    roof: preset.roof,
    permit: preset.permit,
    permitYrs: preset.permitYrs,
    tenure: preset.tenure,
    ooa: preset.ooa ? true : null,
  };
}

export interface PresetFilterState {
  readonly roofAgeMinYears: number | undefined;
  readonly permitStatus: PermitStatusParam;
  readonly permitOpenYrs: number | undefined;
  readonly tenureYearsMin: number | undefined;
  readonly outOfArea: boolean;
}

/** True while the filters still equal the preset exactly (the pressed state). */
export function presetMatches(preset: FilterPreset, state: PresetFilterState): boolean {
  return (
    state.roofAgeMinYears === (preset.roof === ROOF_ANY ? undefined : preset.roof) &&
    state.permitStatus === (preset.permit ?? "any") &&
    state.permitOpenYrs === (preset.permitYrs ?? undefined) &&
    state.tenureYearsMin === (preset.tenure ?? undefined) &&
    state.outOfArea === preset.ooa
  );
}
