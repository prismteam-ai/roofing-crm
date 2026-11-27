import { DEFAULT_ROOF_AGE_YEARS, LONG_OPEN_YEARS } from './schemas.js';

export interface ScoreInput {
  roofAgeYears: number | null;
  roofBasisIsPermit: boolean;
  openRoofPermits: number;
  longestOpenDays: number | null;
  ownerOccupied: boolean | null;
  roofAgeThreshold?: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Deterministic lead score, 0-100. Plain rules, no model: the same property always gets the
 * same score and every point is explained. Long-open roofing permits weigh most, because a
 * stalled roof job is the strongest buying signal; roof age comes second.
 */
export function scoreLead(input: ScoreInput): ScoreResult {
  const threshold = input.roofAgeThreshold ?? DEFAULT_ROOF_AGE_YEARS;
  const reasons: string[] = [];
  let score = 0;

  if (input.openRoofPermits > 0) {
    const years = (input.longestOpenDays ?? 0) / 365.25;
    const permitPoints = Math.min(55, 25 + Math.round(years * 6));
    score += permitPoints;
    reasons.push(
      years >= LONG_OPEN_YEARS
        ? `Roofing permit open ${years.toFixed(1)} years (+${permitPoints})`
        : `Open roofing permit (+${permitPoints})`,
    );
  }

  if (input.roofAgeYears !== null && input.roofAgeYears >= threshold) {
    const over = input.roofAgeYears - threshold;
    const agePoints = Math.min(35, 15 + Math.round(over * 0.8));
    score += agePoints;
    reasons.push(`Roof about ${input.roofAgeYears} years old (+${agePoints})`);
    if (input.roofBasisIsPermit) {
      score += 5;
      reasons.push('Roof age from a completed roofing permit (+5)');
    }
  }

  if (input.ownerOccupied === true && score > 0) {
    score += 5;
    reasons.push('Owner-occupied (+5)');
  }

  return { score: Math.min(100, score), reasons };
}
