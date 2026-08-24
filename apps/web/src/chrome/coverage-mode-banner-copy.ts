/**
 * Coverage-mode banner copy for honesty chrome.
 *
 * Demo Chester uses the pipeline contract labeling block verbatim.
 * Real Chester states 42/73 coverage and distinguishes UCC from county GIS.
 * Lee fallback names Chester as unpublished.
 */

/** Matches packages/shared CoverageMode (honesty / default-geography mode). */
export type CoverageMode =
  | "lee_dev_fallback"
  | "chester_demo_synthetic"
  | "chester_real_limited"
  | "montgomery_roof_age_demo";

/** Chester property count (real and demo share the same parcel roll). */
export const CHESTER_PARCEL_COUNT = 87274;

/**
 * Published folio count for Montgomery roof-age demo (11/62 munis, ~9% of roll).
 */
export const MONTGOMERY_ROOF_AGE_DEMO_PARCEL_COUNT = 26444;

/** Verbatim badge from elephant-pipeline chester-demo.json labeling block. */
export const CHESTER_DEMO_SYNTHETIC_BADGE = "Synthetic data for evaluation.";

/** Verbatim roof-age disclaimer from chester-demo.json labeling block. */
export const CHESTER_DEMO_ROOF_AGE_DISCLAIMER =
  "Roof ages and built_year values marked synthetic_demo are demo signals, not real Chester County roof ages.";

/**
 * Builds the single status sentence for the coverage banner.
 */
export function resolveCoverageModeBannerCopy(coverageMode: CoverageMode): string {
  if (coverageMode === "chester_demo_synthetic") {
    return `${CHESTER_PARCEL_COUNT.toLocaleString("en-US")} parcels with 42 of 73 municipalities covered. ${CHESTER_DEMO_SYNTHETIC_BADGE}`;
  }

  if (coverageMode === "chester_real_limited") {
    return `${CHESTER_PARCEL_COUNT.toLocaleString("en-US")} parcels · 42 of 73 munis. No published roof ages; permits are UCC candidates vs county GIS health/planning — not roofing UCC.`;
  }

  if (coverageMode === "montgomery_roof_age_demo") {
    return `${MONTGOMERY_ROOF_AGE_DEMO_PARCEL_COUNT.toLocaleString("en-US")} parcels · 11 of 62 munis. Roof-age demo only; no permits. Not on the Oracle catalog.`;
  }

  return "Chester unpublished";
}

/**
 * Territory heading for the shell. Names the served place — never titles Lee as Chester.
 */
export function resolveTerritoryHeading(coverageMode: CoverageMode): string {
  if (coverageMode === "chester_demo_synthetic") {
    return "Chester (demo data)";
  }
  if (coverageMode === "chester_real_limited") {
    return "Chester (real)";
  }
  if (coverageMode === "montgomery_roof_age_demo") {
    return "Montgomery County, PA";
  }
  return "Lee County, FL";
}
