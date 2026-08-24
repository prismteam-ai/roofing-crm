/**
 * Roof-age bands for prospect marker coloring.
 *
 * Darker weathered-wood / oxide tones mean older structure (roof-age proxy).
 * Saved-lead and archived marker states override these colors in CSS.
 */

/** Canonical age-band ids used on marker elements and in the legend. */
export const PLAT_ROOF_MARKER_AGE_BAND_IDS = [
  "age-under-10",
  "age-10-to-19",
  "age-20-to-29",
  "age-30-to-39",
  "age-40-to-49",
  "age-50-plus",
  "age-unknown",
] as const;

export type PlatRoofMarkerAgeBandId = (typeof PLAT_ROOF_MARKER_AGE_BAND_IDS)[number];

export interface PlatRoofMarkerAgeBand {
  id: PlatRoofMarkerAgeBandId;
  /** Hex fill for markers and legend swatches. */
  color: string;
  /** Short label for tooltips and screen readers. */
  label: string;
}

/** Ordered newest → oldest; unknown is separate. */
export const PLAT_ROOF_MARKER_AGE_BANDS: readonly PlatRoofMarkerAgeBand[] = [
  {
    id: "age-under-10",
    color: "#e8e2d6",
    label: "Under 10 years",
  },
  {
    id: "age-10-to-19",
    color: "#d9c9a8",
    label: "10–19 years",
  },
  {
    id: "age-20-to-29",
    color: "#c4a574",
    label: "20–29 years",
  },
  {
    id: "age-30-to-39",
    color: "#a97e4f",
    label: "30–39 years",
  },
  {
    id: "age-40-to-49",
    color: "#8f5a38",
    label: "40–49 years",
  },
  {
    id: "age-50-plus",
    color: "#6e3f28",
    label: "50+ years",
  },
] as const;

export const PLAT_ROOF_MARKER_AGE_UNKNOWN_BAND: PlatRoofMarkerAgeBand = {
  id: "age-unknown",
  color: "#b8b1a4",
  label: "Year not on record",
};

const PLAT_ROOF_MARKER_AGE_BAND_BY_ID: Readonly<
  Record<PlatRoofMarkerAgeBandId, PlatRoofMarkerAgeBand>
> = {
  "age-under-10": PLAT_ROOF_MARKER_AGE_BANDS[0],
  "age-10-to-19": PLAT_ROOF_MARKER_AGE_BANDS[1],
  "age-20-to-29": PLAT_ROOF_MARKER_AGE_BANDS[2],
  "age-30-to-39": PLAT_ROOF_MARKER_AGE_BANDS[3],
  "age-40-to-49": PLAT_ROOF_MARKER_AGE_BANDS[4],
  "age-50-plus": PLAT_ROOF_MARKER_AGE_BANDS[5],
  "age-unknown": PLAT_ROOF_MARKER_AGE_UNKNOWN_BAND,
};

/**
 * Resolves the age band for one prospect marker from structure built year.
 */
export function resolvePlatRoofMarkerAgeBand(arguments_: {
  builtYear: number | null | undefined;
  currentUtcYear: number;
}): PlatRoofMarkerAgeBandId {
  const { builtYear, currentUtcYear } = arguments_;

  if (builtYear === null || builtYear === undefined) {
    return "age-unknown";
  }

  const structureAgeYears = currentUtcYear - builtYear;

  if (structureAgeYears < 10) {
    return "age-under-10";
  }
  if (structureAgeYears < 20) {
    return "age-10-to-19";
  }
  if (structureAgeYears < 30) {
    return "age-20-to-29";
  }
  if (structureAgeYears < 40) {
    return "age-30-to-39";
  }
  if (structureAgeYears < 50) {
    return "age-40-to-49";
  }

  return "age-50-plus";
}

/**
 * Looks up band metadata for CSS, legend, and aria copy.
 */
export function resolvePlatRoofMarkerAgeBandMetadata(
  ageBandId: PlatRoofMarkerAgeBandId,
): PlatRoofMarkerAgeBand {
  return PLAT_ROOF_MARKER_AGE_BAND_BY_ID[ageBandId];
}
