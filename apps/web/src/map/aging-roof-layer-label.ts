/**
 * Aging-roof layer copy for map chrome.
 *
 * Labels structure year built as a roof-age proxy — Elephant has no roof-install
 * year, so the UI must never say “roof installed.”
 */

/** Default structure-age threshold (years) matching search.inRadius. */
export const DEFAULT_MIN_STRUCTURE_AGE_YEARS = 15;

/**
 * Chip copy when the query table publishes no structure years for this county.
 */
export const AGING_ROOF_STRUCTURE_YEAR_UNAVAILABLE_CHIP_COPY =
  "Year not published on this surface";

/**
 * Builds the visible aging-roof layer label for a structure-age cutoff year.
 *
 * Example (2026, threshold 15): “Structure built before 2011 (roof-age proxy)”.
 */
export function formatAgingRoofLayerLabel(arguments_: {
  currentUtcYear: number;
  minStructureAgeYears: number;
}): string {
  const builtYearCutoff = arguments_.currentUtcYear - arguments_.minStructureAgeYears;
  return `Structure built before ${builtYearCutoff} (roof-age proxy)`;
}

/**
 * Resolves the aging-roof label for “now” in UTC (client chrome default).
 */
export function resolveAgingRoofLayerLabel(
  minStructureAgeYears: number = DEFAULT_MIN_STRUCTURE_AGE_YEARS,
): string {
  return formatAgingRoofLayerLabel({
    currentUtcYear: new Date().getUTCFullYear(),
    minStructureAgeYears,
  });
}

/**
 * Chip copy when the structure-year filter hides roofs that are still in radius.
 */
export function formatAgingRoofHiddenDoorsChip(hiddenCount: number): string {
  if (hiddenCount === 1) {
    return "1 roof hidden";
  }
  return `${String(hiddenCount)} roofs hidden`;
}
