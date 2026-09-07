/**
 * County constants for the CRM.
 *
 * Copied (not imported) from the Osceola pipeline's `county.ts` so the CRM has no
 * cross-repo dependency; the key must match the MCP server's query-table maps.
 *
 * @module config/county
 */

/** A named place usable as a search anchor ("within five miles of Kissimmee"). */
export interface Place {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Alternate spellings accepted by the geocoder (lower-case). */
  readonly aliases: readonly string[];
}

/** Configuration of one supported county. Only Osceola is enabled in this milestone. */
export interface CountyConfig {
  /** Key passed as `county` to every MCP tool. */
  readonly key: string;
  readonly name: string;
  readonly label: string;
  readonly stateCode: string;
  readonly fips: string;
  readonly bbox: {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLng: number;
    readonly maxLng: number;
  };
  /** Map center on load. */
  readonly center: { readonly lat: number; readonly lng: number };
  readonly places: readonly Place[];
  readonly thresholds: {
    readonly roofAgeYears: number;
    readonly longOpenPermitYears: number;
    readonly ownershipTenureYears: number;
    readonly radiusMiles: number;
  };
  readonly enabled: boolean;
}

/** Osceola County, FL - the default and only enabled county. */
export const OSCEOLA: CountyConfig = {
  key: "osceola",
  name: "Osceola",
  label: "Osceola County, FL",
  stateCode: "FL",
  fips: "12097",
  bbox: { minLat: 27.55, maxLat: 28.4, minLng: -81.7, maxLng: -80.85 },
  center: { lat: 28.2, lng: -81.3 },
  places: [
    {
      name: "Kissimmee",
      lat: 28.2919,
      lng: -81.4076,
      aliases: ["kissimmee", "kissimee", "kissimmee fl"],
    },
    {
      name: "St. Cloud",
      lat: 28.2489,
      lng: -81.2812,
      aliases: ["st cloud", "st. cloud", "saint cloud"],
    },
    { name: "Celebration", lat: 28.3253, lng: -81.5331, aliases: ["celebration"] },
    { name: "Poinciana", lat: 28.1403, lng: -81.4587, aliases: ["poinciana"] },
    { name: "Harmony", lat: 28.1922, lng: -81.1503, aliases: ["harmony"] },
  ],
  thresholds: {
    roofAgeYears: 15,
    longOpenPermitYears: 5,
    ownershipTenureYears: 10,
    radiusMiles: 3,
  },
  enabled: true,
};

/** Counties shown in the county selector. Disabled entries are visible but not selectable. */
export const COUNTIES: readonly CountyConfig[] = [
  OSCEOLA,
  {
    ...OSCEOLA,
    key: "orange",
    name: "Orange",
    label: "Orange County, FL",
    fips: "12095",
    enabled: false,
  },
  {
    ...OSCEOLA,
    key: "polk",
    name: "Polk",
    label: "Polk County, FL",
    fips: "12105",
    enabled: false,
  },
  { ...OSCEOLA, key: "lee", name: "Lee", label: "Lee County, FL", fips: "12071", enabled: false },
];

/** Radius slider bounds (miles). */
export const RADIUS_MILES = { min: 0.5, max: 15, step: 0.5 } as const;

/**
 * Resolve a free-text place name to coordinates using the county's place list.
 * Matching is case-insensitive on name/aliases; returns `null` when unknown.
 */
export function geocodePlace(query: string, county: CountyConfig = OSCEOLA): Place | null {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/,?\s*(fl|florida)$/i, "")
    .trim();
  if (!q) return null;
  for (const place of county.places) {
    if (place.name.toLowerCase() === q || place.aliases.includes(q)) return place;
  }
  for (const place of county.places) {
    if (q.includes(place.name.toLowerCase()) || place.aliases.some((a) => q.includes(a)))
      return place;
  }
  return null;
}
