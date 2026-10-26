// Versioned confidence bands for place resolution (ADR-06 §5 footnote, docs/decisions/
// 0000-agent-architecture.md; plan.md "Patterns the code must show" pattern #4). These are the
// binding bands — PO-accepted 2026-10-23, per agent-design.md's "Corrections found while
// compiling" #1 — which supersede both the story's looser "<0.80 -> clarify" paraphrase and
// alakazam's own free-text drift in the same design consult. B-09 calibrates these on the place
// fixture set and records the final values here, versioned, so a later recalibration is a
// one-file change with a clear history, never a magic number repeated at each call site.
export const PLACE_CONFIDENCE_BANDS_VERSION = "2026-10-23";

export const PLACE_CONFIDENCE_BANDS = {
  /** Exact/alias match = 1.0; a fuzzy match needs both this score and the margin below. */
  autoMinScore: 0.92,
  /** The top candidate must lead the runner-up by at least this much to auto-accept. */
  autoMinMargin: 0.05,
  /** Below this score (regardless of margin): refuse, outcome `not_found`. */
  clarifyMinScore: 0.8,
} as const;

export type PlaceConfidenceBand = "auto" | "clarify" | "refuse";

/** ADR-06 §5's table, as code: auto only when the score clears `autoMinScore` AND the margin
 *  clears `autoMinMargin` (two close candidates never auto-accept, however high the top score);
 *  refuse below `clarifyMinScore`, regardless of margin; everything else clarifies. */
export function classifyPlaceConfidence(score: number, margin: number): PlaceConfidenceBand {
  if (score < PLACE_CONFIDENCE_BANDS.clarifyMinScore) return "refuse";
  if (
    score >= PLACE_CONFIDENCE_BANDS.autoMinScore &&
    margin >= PLACE_CONFIDENCE_BANDS.autoMinMargin
  ) {
    return "auto";
  }
  return "clarify";
}
