import {
  scoreLead,
  type Candidate,
  type LeadCreate,
  type Permit,
  type PropertyDetail,
} from '@roofing-crm/shared';
import { formatOpenDuration } from './format.js';

type Priority = LeadCreate['priority'];

/** Starting priority from the lead score. The user can change it afterwards. */
export function priorityForScore(score: number): Priority {
  if (score >= 60) return 'high';
  return score >= 30 ? 'medium' : 'low';
}

export function leadFromCandidate(candidate: Candidate): LeadCreate {
  return {
    apn: candidate.apn,
    permitId: null,
    address: candidate.address,
    city: candidate.city,
    lat: candidate.lat,
    lon: candidate.lon,
    priority: priorityForScore(candidate.score),
    assignee: null,
    notes: '',
    signal: {
      roofAgeYears: candidate.roofAgeYears,
      roofBasis: candidate.roofBasis,
      openRoofPermits: candidate.openRoofPermits,
      longestOpenDays: candidate.longestOpenDays,
      score: candidate.score,
    },
  };
}

export const openRoofingPermits = (detail: PropertyDetail): Permit[] =>
  detail.permits.filter((permit) => permit.isRoofing && permit.isOpen);

/**
 * Lead from the property drawer. The signal snapshot is rebuilt from the detail record with the
 * shared scoring rules, so it matches what the search list shows for the same property.
 */
export function leadFromProperty(
  detail: PropertyDetail,
  roofAgeThreshold: number,
  permit?: Permit,
): LeadCreate {
  const open = openRoofingPermits(detail);
  const longestOpenDays = open.reduce<number | null>(
    (max, p) => (p.daysOpen !== null && (max === null || p.daysOpen > max) ? p.daysOpen : max),
    null,
  );
  const { score } = scoreLead({
    roofAgeYears: detail.roofAgeYears,
    roofBasisIsPermit: detail.roofBasis === 'last_roofing_permit',
    openRoofPermits: open.length,
    longestOpenDays,
    ownerOccupied: detail.ownerOccupied,
    roofAgeThreshold,
  });
  const contractor = permit?.contractor?.name;
  return {
    apn: detail.apn,
    permitId: permit?.permitId ?? null,
    address: detail.address,
    city: detail.city,
    lat: detail.lat,
    lon: detail.lon,
    priority: priorityForScore(score),
    assignee: null,
    notes: permit
      ? `From roofing permit ${permit.permitId} (${formatOpenDuration(permit.daysOpen)})` +
        (contractor ? `, contractor ${contractor}.` : '.')
      : '',
    signal: {
      roofAgeYears: detail.roofAgeYears,
      roofBasis: detail.roofBasis,
      openRoofPermits: open.length,
      longestOpenDays,
      score,
    },
  };
}
