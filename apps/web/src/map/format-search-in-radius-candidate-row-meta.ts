/**
 * Candidate-list row meta copy — distance, structure year, and roof-age line.
 */

/**
 * Distance chip for the first row (e.g. `0.5mi`).
 */
export function formatSearchInRadiusCandidateDistanceCopy(
  distanceMiles: number,
): string {
  return `${distanceMiles.toFixed(1)}mi`;
}

/**
 * Second-row left segment: city plus published structure year when present.
 */
export function formatSearchInRadiusCandidateStructureLineCopy(arguments_: {
  addressCity: string | null;
  builtYear: number | null;
}): string {
  const city = arguments_.addressCity ?? "City not published";
  if (arguments_.builtYear === null) {
    return city;
  }
  return `${city} structure ${String(arguments_.builtYear)}`;
}

/**
 * Synthetic demo structure years stay a proxy; published county years do not.
 */
export function isSearchInRadiusCandidateRoofAgeProxy(
  builtYearSource: string | null | undefined,
): boolean {
  return builtYearSource === "synthetic_demo";
}

/**
 * Second-row right segment: roof age from structure year, or honest unknown.
 */
export function formatSearchInRadiusCandidateRoofAgeCopy(arguments_: {
  builtYear: number | null;
  builtYearSource?: string | null;
  currentUtcYear?: number;
}): string {
  const {
    builtYear,
    builtYearSource,
    currentUtcYear = new Date().getUTCFullYear(),
  } = arguments_;

  if (builtYear === null) {
    return "roof age unknown";
  }

  const roofAgeYears = currentUtcYear - builtYear;
  if (isSearchInRadiusCandidateRoofAgeProxy(builtYearSource)) {
    return `roof ${String(roofAgeYears)}y/o aprox`;
  }

  return `roof ${String(roofAgeYears)}y/o`;
}
