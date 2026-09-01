import { TIER_LABELS, type EvidenceTier } from '@roofing-crm/shared';
import type { LeadCandidate } from '../lib/leads.js';
import type { OpenPermitCandidate } from '../lib/permits.js';

function isOpenPermitCandidate(c: LeadCandidate): c is OpenPermitCandidate {
  return c.tier === 'A' && 'permitOpenDays' in c;
}

function permitMeta(c: OpenPermitCandidate): string {
  const years = (c.permitOpenDays / 365).toFixed(1);
  return `open ${years} yrs${c.issuedDate ? ` (since ${c.issuedDate})` : ''}`;
}

export type CandidatesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; candidates: LeadCandidate[] }
  | { status: 'error'; error: string };

interface Props {
  state: CandidatesState;
  selectedParcelId: string | null;
  onSelect: (parcelId: string) => void;
}

const TIER_ORDER: EvidenceTier[] = ['A', 'B', 'C', 'UNKNOWN'];

export function CandidateList({ state, selectedParcelId, onSelect }: Props) {
  if (state.status === 'idle') {
    return (
      <section className="panel">
        <h2 className="panel__title">Candidates</h2>
        <p className="muted">Drop a pin or use your location to search.</p>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <section className="panel">
        <h2 className="panel__title">Candidates</h2>
        <p className="muted">Querying&hellip;</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="panel">
        <h2 className="panel__title">Candidates</h2>
        <p className="alert">{state.error}</p>
      </section>
    );
  }

  const { candidates } = state;
  const byTier: Partial<Record<EvidenceTier, LeadCandidate[]>> = {};
  for (const c of candidates) (byTier[c.tier] ??= []).push(c);

  return (
    <section className="panel">
      <h2 className="panel__title">Candidates ({candidates.length})</h2>
      {candidates.length === 0 ? (
        <p className="muted">No open roofing permits or properties matched in this radius at this roof-age threshold.</p>
      ) : null}

      <div className="candidate-counts">
        {TIER_ORDER.filter((t) => (byTier[t]?.length ?? 0) > 0).map((t) => (
          <span key={t} className={`tier-chip tier-chip--${t}`}>
            {t === 'UNKNOWN' ? 'Unknown' : t} {byTier[t]!.length}
          </span>
        ))}
      </div>

      <ul className="candidate-list">
        {candidates.map((c) => (
          <li key={c.parcelId}>
            <button
              type="button"
              className={`candidate ${selectedParcelId === c.parcelId ? 'is-selected' : ''}`}
              onClick={() => onSelect(c.parcelId)}
              data-parcel-id={c.parcelId}
              data-tier={c.tier}
            >
              <span className={`tier-badge tier-badge--${c.tier}`} title={TIER_LABELS[c.tier]}>
                {c.tier === 'UNKNOWN' ? '?' : c.tier}
              </span>
              <span className="candidate__body">
                <span className="candidate__address">{c.address ?? c.parcelId}</span>
                <span className="candidate__meta">
                  {c.distanceMiles.toFixed(1)} mi
                  {isOpenPermitCandidate(c)
                    ? ` · ${permitMeta(c)}`
                    : c.roofAgeYears !== null
                      ? ` · roof ${c.roofAgeYears} yrs (${TIER_LABELS[c.tier]})`
                      : ' · roof age unknown'}
                </span>
              </span>
              <span className="candidate__score" title="Lead score">{c.score}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
