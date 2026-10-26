// Roof-age threshold rule (agent-design.md, plan.md "Patterns the code must show"): a named
// constant, never a magic `15` repeated across the UI and the API. Inclusive at the threshold
// (`isAgedRoof(15, 15) === true`, `isAgedRoof(14, 15) === false` — tasks.md T004,
// testplans/B-03-test-cases.md TC-013). A `roofAgeYears` of `null` is never "aged" — the caller
// is responsible for showing its `missingReasons` entry instead of calling this with null.
export const DEFAULT_ROOF_AGE_YEARS = 15;

export function isAgedRoof(roofAgeYears: number | null, thresholdYears: number): boolean {
  return roofAgeYears !== null && roofAgeYears >= thresholdYears;
}
