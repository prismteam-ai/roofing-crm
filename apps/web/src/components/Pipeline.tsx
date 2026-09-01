import { useMemo, useRef, useState } from 'react';
import {
  CRM_STAGES, TIER_LABELS, haversineMiles,
  type CrmLead, type CrmStage, type EvidenceTier, type LatLon,
} from '@roofing-crm/shared';

const TIER_ORDER: EvidenceTier[] = ['A', 'B', 'C', 'UNKNOWN'];

interface Props {
  leads: CrmLead[];
  ownerName: string;
  onOwnerNameChange: (name: string) => void;
  onAdvanceStage: (lead: CrmLead, stage: CrmStage) => void;
  onAddNote: (lead: CrmLead, text: string) => void;
  onDelete: (lead: CrmLead) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onViewOnMap: (lead: CrmLead) => void;
  /** Used as the centre for the location-radius filter when set. */
  searchCenter: LatLon | null;
  countyCenter: LatLon;
}

function LeadCard({ lead, ownerName, onAdvanceStage, onAddNote, onDelete, onViewOnMap }: {
  lead: CrmLead;
  ownerName: string;
  onAdvanceStage: (lead: CrmLead, stage: CrmStage) => void;
  onAddNote: (lead: CrmLead, text: string) => void;
  onDelete: (lead: CrmLead) => void;
  onViewOnMap: (lead: CrmLead) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');

  return (
    <div className="lead-card">
      <div className="lead-card__top">
        <span className={`tier-badge tier-badge--${lead.tier}`} title={TIER_LABELS[lead.tier]}>
          {lead.tier === 'UNKNOWN' ? '?' : lead.tier}
        </span>
        <span className="lead-card__address">{lead.address ?? lead.parcelId}</span>
        {lead.isDemo ? <span className="tier-chip tier-chip--UNKNOWN" title="Seeded from real data on first visit">Demo</span> : null}
      </div>

      <p className="candidate__meta">
        {lead.permitNumber
          ? `Permit ${lead.permitNumber}${lead.permitOpenDays !== null ? ` · open ${(lead.permitOpenDays / 365).toFixed(1)} yrs` : ''}`
          : lead.roofAgeYears !== null ? `Roof ${lead.roofAgeYears} yrs` : 'Roof age unknown'}
        {' · score '}{lead.score}
      </p>

      <div className="row">
        <select
          className="lead-card__stage"
          value={lead.stage}
          onChange={(e) => onAdvanceStage(lead, e.target.value as CrmStage)}
        >
          {CRM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onViewOnMap(lead)}>Map</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExpanded((v) => !v)}>
          Notes ({lead.notes.length})
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(lead)} aria-label="Delete lead">
          Delete
        </button>
      </div>

      {expanded ? (
        <div className="lead-card__expanded">
          <ul className="lead-card__notes">
            {lead.notes.map((n) => (
              <li key={n.id}><span className="mono">{new Date(n.createdAt).toLocaleDateString()}</span> {n.text}</li>
            ))}
            {lead.notes.length === 0 ? <li className="muted">No notes yet.</li> : null}
          </ul>
          <div className="row">
            <input
              className="lead-card__note-input"
              placeholder={`Note as ${ownerName}...`}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && noteText.trim()) { onAddNote(lead, noteText); setNoteText(''); }
              }}
            />
            <button
              type="button" className="btn btn--sm"
              onClick={() => { if (noteText.trim()) { onAddNote(lead, noteText); setNoteText(''); } }}
            >
              Add
            </button>
          </div>
          <ul className="lead-card__activity">
            {lead.activity.slice().reverse().map((a) => (
              <li key={a.id} className="muted">{new Date(a.at).toLocaleDateString()} — {a.summary} ({a.actor})</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function Pipeline({
  leads, ownerName, onOwnerNameChange, onAdvanceStage, onAddNote, onDelete, onExport, onImport, onViewOnMap,
  searchCenter, countyCenter,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tierFilter, setTierFilter] = useState<Set<EvidenceTier>>(new Set(TIER_ORDER));
  const [minRoofAge, setMinRoofAge] = useState(0);
  const [minOpenYears, setMinOpenYears] = useState(0);
  const [radiusOn, setRadiusOn] = useState(false);
  const [radiusMiles, setRadiusMiles] = useState(10);

  const filterCenter = searchCenter ?? countyCenter;

  const filteredLeads = useMemo(() => leads.filter((l) => {
    if (!tierFilter.has(l.tier)) return false;
    if (minRoofAge > 0 && (l.roofAgeYears === null || l.roofAgeYears < minRoofAge)) return false;
    if (minOpenYears > 0 && (l.permitOpenDays === null || l.permitOpenDays / 365 < minOpenYears)) return false;
    if (radiusOn && haversineMiles(filterCenter, { lat: l.lat, lon: l.lon }) > radiusMiles) return false;
    return true;
  }), [leads, tierFilter, minRoofAge, minOpenYears, radiusOn, radiusMiles, filterCenter]);

  const byStage: Partial<Record<CrmStage, CrmLead[]>> = {};
  for (const l of filteredLeads) (byStage[l.stage] ??= []).push(l);

  const toggleTier = (t: EvidenceTier) => {
    setTierFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  return (
    <div className="pipeline">
      <div className="pipeline__toolbar">
        <label className="field field--inline">
          <span>Acting as</span>
          <input value={ownerName} onChange={(e) => onOwnerNameChange(e.target.value)} placeholder="Your name" />
        </label>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={onExport} disabled={leads.length === 0}>
            Export JSON
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => fileInputRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileInputRef} type="file" accept="application/json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }}
          />
        </div>
      </div>

      {leads.length === 0 ? (
        <p className="muted">
          No leads yet. Find a property or permit on the map and use &ldquo;Add to leads&rdquo; in its
          detail panel, or wait a moment for the dataset to seed a few real examples.
        </p>
      ) : (
        <section className="panel pipeline__filters">
          <h2 className="panel__title">Filter leads</h2>
          <div className="candidate-counts">
            {TIER_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`tier-chip tier-chip--${t} ${tierFilter.has(t) ? '' : 'is-off'}`}
                onClick={() => toggleTier(t)}
                aria-pressed={tierFilter.has(t)}
              >
                {t === 'UNKNOWN' ? 'Unknown' : t}
              </button>
            ))}
          </div>

          <div className="pipeline__filter-row">
            <label className="field field--inline">
              <span>Min roof age <strong>{minRoofAge} yrs</strong></span>
              <input
                type="range" min={0} max={60} step={1} value={minRoofAge}
                onChange={(e) => setMinRoofAge(Number(e.target.value))}
              />
            </label>
            <label className="field field--inline">
              <span>Min permit open <strong>{minOpenYears} yrs</strong></span>
              <input
                type="range" min={0} max={15} step={0.5} value={minOpenYears}
                onChange={(e) => setMinOpenYears(Number(e.target.value))}
              />
            </label>
            <label className="field field--inline">
              <input type="checkbox" checked={radiusOn} onChange={(e) => setRadiusOn(e.target.checked)} />
              <span>
                Within <strong>{radiusMiles} mi</strong> of {searchCenter ? 'current search' : 'county centre'}
              </span>
              <input
                type="range" min={0.5} max={25} step={0.5} value={radiusMiles} disabled={!radiusOn}
                onChange={(e) => setRadiusMiles(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">Showing {filteredLeads.length} of {leads.length} leads.</p>
        </section>
      )}

      <div className="pipeline__board">
        {CRM_STAGES.map((stage) => (
          <section key={stage} className="pipeline__column">
            <h3 className="pipeline__column-title">{stage} ({byStage[stage]?.length ?? 0})</h3>
            {(byStage[stage] ?? []).map((lead) => (
              <LeadCard
                key={lead.id} lead={lead} ownerName={ownerName}
                onAdvanceStage={onAdvanceStage} onAddNote={onAddNote} onDelete={onDelete} onViewOnMap={onViewOnMap}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
