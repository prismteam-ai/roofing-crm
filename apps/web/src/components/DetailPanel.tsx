import { TIER_DESCRIPTIONS, TIER_LABELS } from '@roofing-crm/shared';
import type { LeadCandidate } from '../lib/leads.js';
import { isOpenPermitCandidate } from '../lib/permits.js';

function formatMoney(v: number | null): string {
  return v === null ? 'not available' : `$${v.toLocaleString()}`;
}

interface Props {
  candidate: LeadCandidate | null;
  onClose: () => void;
  /** Null when this candidate is not yet saved as a lead. */
  existingLeadId: string | null;
  onAddToLeads: (candidate: LeadCandidate) => void;
}

/**
 * Property/permit detail. Contractor and BBB are always "not available" as of
 * dataset_version 2026-09-01.r202609011309 -- no contractors/businesses table
 * is published yet -- shown honestly rather than fabricated or hidden, same
 * rule as an UNKNOWN roof-age basis.
 */
export function DetailPanel({ candidate, onClose, existingLeadId, onAddToLeads }: Props) {
  if (!candidate) return null;
  const permit = isOpenPermitCandidate(candidate) ? candidate : null;

  return (
    <div className="detail-panel" role="dialog" aria-label="Property detail">
      <div className="detail-panel__header">
        <div>
          <span className={`tier-badge tier-badge--${candidate.tier}`} title={TIER_LABELS[candidate.tier]}>
            {candidate.tier === 'UNKNOWN' ? '?' : candidate.tier}
          </span>
          <strong className="detail-panel__title">
            {permit?.permitAddress ?? candidate.address ?? candidate.parcelId}
          </strong>
        </div>
        <button type="button" className="detail-panel__close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <p className="note">{TIER_DESCRIPTIONS[candidate.tier]}</p>

      <button
        type="button"
        className="btn btn--full"
        disabled={existingLeadId !== null}
        onClick={() => onAddToLeads(candidate)}
      >
        {existingLeadId !== null ? 'Already in pipeline' : 'Add to leads'}
      </button>

      <h3 className="panel__sub">Permit</h3>
      {permit ? (
        <dl className="kv">
          <dt>Permit #</dt><dd className="mono">{permit.permitNumber}</dd>
          <dt>Type</dt><dd>{permit.permitType ?? 'not available'}</dd>
          <dt>Status</dt>
          <dd>{permit.permitStatusRaw ?? permit.permitStatusNormalized}
            {permit.permitStatusNormalized === 'UNKNOWN' ? ' (unconfirmed)' : ''}</dd>
          <dt>Issued</dt><dd>{permit.issuedDate ?? 'not available'}</dd>
          <dt>Open</dt><dd>{(permit.permitOpenDays / 365).toFixed(1)} yrs ({permit.permitOpenDays.toLocaleString()} days)</dd>
        </dl>
      ) : (
        <p className="muted">No open roofing permit found on this parcel in this dataset.</p>
      )}

      <h3 className="panel__sub">Contractor &amp; BBB</h3>
      <p className="muted">
        Not available — the pipeline has not published contractor or BBB records yet.
        No score is shown rather than an estimated one.
      </p>

      <h3 className="panel__sub">Property</h3>
      <dl className="kv">
        <dt>Parcel ID</dt><dd className="mono trunc" title={candidate.parcelId}>{candidate.parcelId}</dd>
        <dt>Owner</dt><dd>{candidate.ownerName ?? 'not available'}</dd>
        <dt>Address</dt><dd>{candidate.address ?? 'not available'}{candidate.city ? `, ${candidate.city}` : ''}</dd>
        <dt>Year built</dt><dd>{candidate.yearBuilt ?? 'not available'}</dd>
        <dt>Roof age</dt>
        <dd>
          {candidate.roofAgeYears !== null ? `${candidate.roofAgeYears} yrs` : 'unknown'}
          {candidate.roofAgeBasis !== 'UNKNOWN' ? ` (${TIER_LABELS[candidate.roofAgeBasis === 'PERMIT' ? 'B' : 'C']})` : ''}
        </dd>
        <dt>Value (FDOR just value)</dt><dd>{formatMoney(candidate.justValue)}</dd>
        <dt>Living area</dt><dd>{candidate.livingAreaSqft ? `${candidate.livingAreaSqft.toLocaleString()} sqft` : 'not available'}</dd>
        <dt>Land use</dt><dd>{candidate.landUseCode ?? 'not available'}</dd>
        <dt>Distance</dt><dd>{candidate.distanceMiles.toFixed(1)} mi from search centre</dd>
      </dl>
    </div>
  );
}
