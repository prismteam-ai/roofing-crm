import {
  DEFAULT_COUNTY,
  DEFAULT_RADIUS_MILES,
  DEFAULT_ROOF_AGE_YEARS,
  inBBox,
  leadStatusSchema,
  MAX_RADIUS_MILES,
  signalSchema,
  sortSchema,
  type LeadStatus,
  type Point,
  type Signal,
  type Sort,
} from '@roofing-crm/shared';
import { roundCoord } from './geo.js';

export const VIEWS = ['map', 'leads', 'data'] as const;
export type View = (typeof VIEWS)[number];
export const PANELS = ['list', 'agent'] as const;
export type Panel = (typeof PANELS)[number];
export const PERMIT_STATUSES = ['any', 'open', 'closed'] as const;
export type PermitStatus = (typeof PERMIT_STATUSES)[number];
export const MIN_OPEN_YEAR_CHOICES = [0, 1, 2, 5, 10] as const;
export const MIN_RADIUS_MILES = 0.25;

export interface SearchFilters {
  signal: Signal;
  minRoofAgeYears: number;
  minOpenYears: number;
  permitStatus: PermitStatus;
  sort: Sort;
}

export interface LeadFilters {
  status: LeadStatus | null;
  minRoofAgeYears: number | null;
  hasOpenPermit: boolean | null;
  minOpenYears: number | null;
  withinMiles: number | null;
}

/** Everything a shared link must carry to reproduce what is on screen. */
export interface UrlState {
  view: View;
  panel: Panel;
  pin: Point | null;
  radiusMiles: number;
  filters: SearchFilters;
  /** Property open in the detail drawer. */
  apn: string | null;
  leadFilters: LeadFilters;
}

export const DEFAULT_FILTERS: SearchFilters = {
  signal: 'any',
  minRoofAgeYears: DEFAULT_ROOF_AGE_YEARS,
  minOpenYears: 0,
  permitStatus: 'any',
  sort: 'score',
};

export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  status: null,
  minRoofAgeYears: null,
  hasOpenPermit: null,
  minOpenYears: null,
  withinMiles: null,
};

export const DEFAULT_URL_STATE: UrlState = {
  view: 'map',
  panel: 'list',
  pin: null,
  radiusMiles: DEFAULT_RADIUS_MILES,
  filters: DEFAULT_FILTERS,
  apn: null,
  leadFilters: DEFAULT_LEAD_FILTERS,
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((item) => item === value) ?? fallback;
}

function numberIn(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

export function clampRadius(miles: number): number {
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, Math.round(miles * 100) / 100));
}

export const inCounty = (point: Point): boolean => inBBox(point, DEFAULT_COUNTY.bbox);

/** Reads state from a query string. Anything missing or invalid falls back to its default. */
export function parseUrlState(search: string): UrlState {
  const q = new URLSearchParams(search);
  const lat = numberIn(q.get('lat'), -90, 90);
  const lon = numberIn(q.get('lon'), -180, 180);
  const pin = lat !== null && lon !== null ? { lat: roundCoord(lat), lon: roundCoord(lon) } : null;
  const apn = q.get('apn');
  const leadStatus = leadStatusSchema.safeParse(q.get('l_status'));
  const leadPermit = q.get('l_permit');
  const minAge = numberIn(q.get('age'), 0, 150);
  return {
    view: oneOf(q.get('view'), VIEWS, 'map'),
    panel: oneOf(q.get('panel'), PANELS, 'list'),
    pin: pin && inCounty(pin) ? pin : null,
    radiusMiles: clampRadius(numberIn(q.get('r'), 0, 1000) ?? DEFAULT_RADIUS_MILES),
    filters: {
      signal: oneOf(q.get('signal'), signalSchema.options, DEFAULT_FILTERS.signal),
      minRoofAgeYears: minAge === null ? DEFAULT_FILTERS.minRoofAgeYears : Math.round(minAge),
      minOpenYears: numberIn(q.get('open'), 0, 60) ?? DEFAULT_FILTERS.minOpenYears,
      permitStatus: oneOf(q.get('status'), PERMIT_STATUSES, DEFAULT_FILTERS.permitStatus),
      sort: oneOf(q.get('sort'), sortSchema.options, DEFAULT_FILTERS.sort),
    },
    apn: apn && /^[A-Za-z0-9-]{3,32}$/.test(apn) ? apn : null,
    leadFilters: {
      status: leadStatus.success ? leadStatus.data : null,
      minRoofAgeYears: numberIn(q.get('l_age'), 0, 150),
      hasOpenPermit: leadPermit === 'yes' ? true : leadPermit === 'no' ? false : null,
      minOpenYears: numberIn(q.get('l_open'), 0, 60),
      withinMiles: numberIn(q.get('l_miles'), 0.01, MAX_RADIUS_MILES),
    },
  };
}

/** Writes state as a query string, leaving defaults out so links stay short. */
export function serializeUrlState(state: UrlState): string {
  const q = new URLSearchParams();
  const put = (key: string, value: string | number | null, fallback?: string | number): void => {
    if (value !== null && value !== fallback) q.set(key, String(value));
  };
  put('view', state.view, 'map');
  put('panel', state.panel, 'list');
  if (state.pin) {
    q.set('lat', String(state.pin.lat));
    q.set('lon', String(state.pin.lon));
  }
  put('r', state.radiusMiles, DEFAULT_RADIUS_MILES);
  put('signal', state.filters.signal, DEFAULT_FILTERS.signal);
  put('age', state.filters.minRoofAgeYears, DEFAULT_FILTERS.minRoofAgeYears);
  put('open', state.filters.minOpenYears, DEFAULT_FILTERS.minOpenYears);
  put('status', state.filters.permitStatus, DEFAULT_FILTERS.permitStatus);
  put('sort', state.filters.sort, DEFAULT_FILTERS.sort);
  put('apn', state.apn);
  put('l_status', state.leadFilters.status);
  put('l_age', state.leadFilters.minRoofAgeYears);
  if (state.leadFilters.hasOpenPermit !== null) {
    q.set('l_permit', state.leadFilters.hasOpenPermit ? 'yes' : 'no');
  }
  put('l_open', state.leadFilters.minOpenYears);
  put('l_miles', state.leadFilters.withinMiles);
  const text = q.toString();
  return text ? `?${text}` : '';
}
