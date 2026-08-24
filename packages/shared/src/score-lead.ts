/**
 * Shared lead scoring for the candidate list and leads.create stamp.
 *
 * One implementation so the number a rep sees on the map is the number stored
 * on the lead. Recompute server-side — never trust a client-supplied score.
 */

export type LeadProvenanceTier = "sourced" | "synthetic_demo";

/**
 * Inputs for composite lead scoring.
 */
export interface ScoreLeadInput {
  structureAgeYears: number | null;
  minStructureAgeYears?: number;
  maxOpenPermitYears: number | null;
  minOpenPermitYears?: number;
  hasSyntheticSignal?: boolean;
}

/**
 * Scores a roofing lead candidate 0–100.
 *
 * Weights: structure age vs threshold (40), open-permit years vs threshold (45),
 * synthetic signal demotion (15) — synthetic still ranks but never outscores an
 * equally strong sourced signal.
 */
export function scoreLead(input: ScoreLeadInput): number {
  const minStructureAgeYears = input.minStructureAgeYears ?? 15;
  const minOpenPermitYears = input.minOpenPermitYears ?? 5;

  let structureScore = 0;
  if (
    input.structureAgeYears !== null &&
    input.structureAgeYears >= minStructureAgeYears
  ) {
    const excess = input.structureAgeYears - minStructureAgeYears;
    structureScore = Math.min(40, 20 + excess);
  }

  let permitScore = 0;
  if (
    input.maxOpenPermitYears !== null &&
    input.maxOpenPermitYears >= minOpenPermitYears
  ) {
    const excess = input.maxOpenPermitYears - minOpenPermitYears;
    permitScore = Math.min(45, 25 + excess * 2);
  }

  const hasQualifyingSignal = structureScore > 0 || permitScore > 0;
  const provenanceScore =
    hasQualifyingSignal && input.hasSyntheticSignal !== true ? 15 : 0;

  return Math.max(
    0,
    Math.min(100, Math.round(structureScore + permitScore + provenanceScore)),
  );
}

/**
 * Weakest-input provenance: any synthetic signal taints the lead for life.
 */
export function resolveLeadProvenanceTier(arguments_: {
  builtYearSource?: string | null;
  permitProvenanceClasses?: Array<string | null | undefined>;
  permitDetailsSource?: string | null;
}): LeadProvenanceTier {
  if (arguments_.builtYearSource === "synthetic_demo") {
    return "synthetic_demo";
  }
  if (arguments_.permitDetailsSource === "synthetic_demo") {
    return "synthetic_demo";
  }
  if (
    (arguments_.permitProvenanceClasses ?? []).some(
      (provenanceClass) => provenanceClass === "synthetic_demo",
    )
  ) {
    return "synthetic_demo";
  }
  return "sourced";
}
