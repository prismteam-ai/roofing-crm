// Recent and saved Map searches, kept in THIS browser only (design/prototype/SearchBox.dc.html:
// "Recent and saved stay in this browser"). Pure logic, no React. Every storage access is in
// try/catch; with storage blocked (private mode, policy, quota) the lists live for the page only,
// like paneState.ts. Both lists are versioned (`.v1` key and a `v` field): an unknown version or
// corrupt JSON reads as an empty list and is overwritten by the next write.
import type { SearchOption } from "./searchSuggest.js";

export const RECENT_KEY = "crm.search.recent.v1";
export const SAVED_KEY = "crm.search.saved.v1";
export const STORAGE_VERSION = 1;
export const MAX_RECENT = 8;
export const MAX_SAVED = 10;

type RecentKind = "place" | "zip" | "permit" | "tcad" | "address";
const RECENT_KINDS: readonly string[] = ["place", "zip", "permit", "tcad", "address"];

/** A search the person ran from the box: enough to run it again without typing. */
export interface RecentSearch {
  readonly id: string;
  readonly kind: RecentKind;
  readonly label: string;
  readonly detail?: string;
  /** Place and ZIP: where the map centres. An address also keeps its coordinates here. */
  readonly point?: { readonly lat: number; readonly lng: number };
  /** Permit and TCAD: the value sent to the API. An address keeps its propertyCid here. */
  readonly lookup?: string;
}

/** A named map view: centre, radius and roof-age filter, re-applied through the URL. */
export interface SavedSearch {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly radiusMi: number;
  readonly roofAgeMinYears?: number;
}

export interface MapView {
  readonly lat: number;
  readonly lng: number;
  readonly radiusMi: number;
  readonly roofAgeMinYears?: number | undefined;
}

// Page-lifetime copies, used when storage is blocked.
const memory = new Map<string, unknown[]>();

/** Test helper: forget the page-lifetime copies. */
export function resetSearchMemory(): void {
  memory.clear();
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isPoint(v: unknown): v is { lat: number; lng: number } {
  return isObject(v) && isNum(v.lat) && isNum(v.lng);
}

function parseRecent(v: unknown): RecentSearch | null {
  if (!isObject(v)) return null;
  const { id, kind, label, detail, point, lookup } = v;
  if (typeof id !== "string" || id === "" || typeof label !== "string" || label === "") return null;
  if (typeof kind !== "string" || !RECENT_KINDS.includes(kind)) return null;
  const isPlace = kind === "place" || kind === "zip";
  const isAddress = kind === "address";
  if ((isPlace || isAddress) && !isPoint(point)) return null;
  if (!isPlace && (typeof lookup !== "string" || lookup === "")) return null;
  return {
    id,
    kind: kind as RecentKind,
    label,
    ...(typeof detail === "string" ? { detail } : {}),
    ...((isPlace || isAddress) && isPoint(point)
      ? { point: { lat: point.lat, lng: point.lng } }
      : {}),
    ...(!isPlace && typeof lookup === "string" ? { lookup } : {}),
  };
}

function parseSaved(v: unknown): SavedSearch | null {
  if (!isObject(v)) return null;
  const { id, name, lat, lng, radiusMi, roofAgeMinYears } = v;
  if (typeof id !== "string" || typeof name !== "string" || name === "") return null;
  if (!isNum(lat) || lat < -90 || lat > 90 || !isNum(lng) || lng < -180 || lng > 180) return null;
  if (!isNum(radiusMi) || radiusMi <= 0) return null;
  if (roofAgeMinYears !== undefined) {
    if (typeof roofAgeMinYears !== "number" || !Number.isInteger(roofAgeMinYears)) return null;
    if (roofAgeMinYears < 0) return null;
  }
  return {
    id,
    name,
    lat,
    lng,
    radiusMi,
    ...(typeof roofAgeMinYears === "number" ? { roofAgeMinYears } : {}),
  };
}

function readList<T>(key: string, parse: (v: unknown) => T | null, max: number): T[] {
  const fallback = (): T[] => ((memory.get(key) ?? []) as T[]).slice(0, max);
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback();
  }
  if (raw === null) return fallback();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.items))
      return [];
    const out: T[] = [];
    for (const item of parsed.items) {
      const ok = parse(item);
      if (ok !== null) out.push(ok);
    }
    return out.slice(0, max);
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: readonly T[]): void {
  memory.set(key, [...items]);
  try {
    localStorage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, items }));
  } catch {
    // Blocked or full: the page-lifetime copy above is all there is.
  }
}

export const loadRecent = (): RecentSearch[] => readList(RECENT_KEY, parseRecent, MAX_RECENT);
export const loadSaved = (): SavedSearch[] => readList(SAVED_KEY, parseSaved, MAX_SAVED);

/** The stored form of a search option, or null when it is not something that can be re-run
 *  (disabled address options, options without a centre or lookup value). */
export function toRecent(option: SearchOption): RecentSearch | null {
  if (option.disabled === true) return null;
  if (option.kind === "address") {
    // A chosen address is re-run without the API: it keeps the property and its coordinates.
    if (option.property === undefined) return null;
    const { propertyCid, lat, lng } = option.property;
    return parseRecent({ ...option, lookup: propertyCid, point: { lat, lng } });
  }
  return parseRecent(option);
}

/** The option a recent entry stands for, so it can go through the live selection handler. */
export function recentToOption(entry: RecentSearch): SearchOption {
  if (entry.kind === "address" && entry.lookup !== undefined && entry.point !== undefined) {
    return {
      id: entry.id,
      kind: "address",
      label: entry.label,
      ...(entry.detail === undefined ? {} : { detail: entry.detail }),
      property: { propertyCid: entry.lookup, lat: entry.point.lat, lng: entry.point.lng },
    };
  }
  return {
    id: entry.id,
    kind: entry.kind,
    label: entry.label,
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    ...(entry.point === undefined ? {} : { point: entry.point }),
    ...(entry.lookup === undefined ? {} : { lookup: entry.lookup }),
  };
}

/** Newest first, de-duplicated by id, at most MAX_RECENT. */
export function pushRecent(entry: RecentSearch): RecentSearch[] {
  const next = [entry, ...loadRecent().filter((e) => e.id !== entry.id)].slice(0, MAX_RECENT);
  writeList(RECENT_KEY, next);
  return next;
}

export function removeRecent(id: string): RecentSearch[] {
  const next = loadRecent().filter((e) => e.id !== id);
  writeList(RECENT_KEY, next);
  return next;
}

export function clearRecent(): RecentSearch[] {
  writeList(RECENT_KEY, []);
  return [];
}

/** Same view (centre to 5 decimals, radius, roof filter) gives the same id. */
export function savedId(view: MapView): string {
  return [
    view.lat.toFixed(5),
    view.lng.toFixed(5),
    String(view.radiusMi),
    view.roofAgeMinYears === undefined ? "" : String(view.roofAgeMinYears),
  ].join("|");
}

export function viewDetail(view: MapView): string {
  const roof =
    view.roofAgeMinYears === undefined ? "" : ` · roof ≥ ${String(view.roofAgeMinYears)}`;
  return `${String(view.radiusMi)} mi${roof}`;
}

/** The place label when the centre came from a place, else "Pin 30.40, -97.45 · 3 mi · roof ≥ 15". */
export function defaultSavedName(view: MapView, placeLabel?: string): string {
  if (placeLabel !== undefined && placeLabel.trim() !== "") return placeLabel.trim();
  return `Pin ${view.lat.toFixed(2)}, ${view.lng.toFixed(2)} · ${viewDetail(view)}`;
}

/** Newest first; saving the same view again replaces it; the oldest falls off past MAX_SAVED. */
export function pushSaved(view: MapView, name: string): SavedSearch[] {
  const id = savedId(view);
  const entry: SavedSearch = {
    id,
    name,
    lat: view.lat,
    lng: view.lng,
    radiusMi: view.radiusMi,
    ...(view.roofAgeMinYears === undefined ? {} : { roofAgeMinYears: view.roofAgeMinYears }),
  };
  const next = [entry, ...loadSaved().filter((e) => e.id !== id)].slice(0, MAX_SAVED);
  writeList(SAVED_KEY, next);
  return next;
}

export function removeSaved(id: string): SavedSearch[] {
  const next = loadSaved().filter((e) => e.id !== id);
  writeList(SAVED_KEY, next);
  return next;
}
