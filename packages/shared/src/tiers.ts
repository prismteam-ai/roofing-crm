/**
 * Evidence tiers for roofing lead candidates.
 *
 * Roof age is this assignment's primary lead criterion, but the pipeline's
 * measured data shows building age cannot carry it. Interpolating the published
 * year-built histogram for Brevard (89,415 parcels with a known year):
 *
 *     roof age >= 15  ->  95.9% of parcels
 *     roof age >= 30  ->  74.7%
 *     roof age >= 60  ->  26.8%
 *
 * The thresholds where a building-age proxy starts to discriminate are past the
 * life of any roof, so a flat "older than N years" filter returns the county
 * rather than a lead list. Candidates are therefore ranked by evidence strength,
 * and every row shows which basis produced it.
 */
import { CLOSED_STATUSES, type PermitStatus, type RoofAgeBasis } from '@roofing-crm/consumer';

export type EvidenceTier = 'A' | 'B' | 'C' | 'UNKNOWN';

export const TIER_LABELS: Record<EvidenceTier, string> = {
  A: 'Open roofing permit',
  B: 'Roof age from permit',
  C: 'Building-age proxy',
  UNKNOWN: 'Roof age unknown',
};

export const TIER_DESCRIPTIONS: Record<EvidenceTier, string> = {
  A: 'An open roofing permit on this property. Strongest signal and actionable now.',
  B: 'Roof age derived from a past roofing permit. High confidence.',
  C: 'Estimated from the building year — the roof may have been replaced since.',
  UNKNOWN: 'No build year or roofing permit on record, so roof age cannot be established.',
};

export interface TierInput {
  roofAgeYears: number | null;
  roofAgeBasis: RoofAgeBasis;
  hasOpenRoofingPermit: boolean;
  roofAgeThreshold: number;
}

export function classifyTier(input: TierInput): EvidenceTier {
  if (input.hasOpenRoofingPermit) return 'A';
  if (input.roofAgeBasis === 'UNKNOWN' || input.roofAgeYears === null) return 'UNKNOWN';
  if (input.roofAgeYears < input.roofAgeThreshold) return 'UNKNOWN';
  return input.roofAgeBasis === 'PERMIT' ? 'B' : 'C';
}

/** A permit is open unless the pipeline normalised it to a terminal status. */
export function isOpenStatus(status: PermitStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

/**
 * UNKNOWN is counted as open by the pipeline, which is the safe default, but it
 * must never be silently ranked alongside confirmed-open permits — a permit of
 * unknown status sitting at the top of a "longest open" list would overstate
 * what we actually know.
 */
export function isStatusUnconfirmed(status: PermitStatus): boolean {
  return status === 'UNKNOWN';
}

export interface LeadScoreInput extends TierInput {
  permitOpenDays: number | null;
  statusUnconfirmed: boolean;
}

const TIER_BASE: Record<EvidenceTier, number> = { A: 60, B: 35, C: 10, UNKNOWN: 0 };

/**
 * 0-100 lead score. Tier dominates, then how long a permit has been open, then
 * roof age. Unconfirmed status is discounted rather than excluded so those rows
 * stay visible but cannot outrank confirmed evidence.
 */
export function leadScore(input: LeadScoreInput): number {
  const tier = classifyTier(input);
  let score = TIER_BASE[tier];

  if (input.permitOpenDays !== null && input.permitOpenDays > 0) {
    // Saturates at ~10 years open; long-open permits are the point of the story.
    score += Math.min(25, (input.permitOpenDays / 3650) * 25);
  }
  if (input.roofAgeYears !== null) {
    const over = input.roofAgeYears - input.roofAgeThreshold;
    if (over > 0) score += Math.min(15, (over / 20) * 15);
  }
  if (input.statusUnconfirmed) score *= 0.75;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/**
 * Owner tenure is only meaningful where a sale actually backs it. FDOR's roll
 * carries current-year sales only, so a missing sale means "unknown", never
 * "held for a long time" — rendering the absence as long tenure would invent a
 * claim about a named property owner.
 */
export function tenureIsTrustworthy(basis: string | null | undefined): boolean {
  return basis === 'FDOR_ROLL_SALE' || basis === 'BCPAO_SALE_HISTORY';
}
