import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULTS,
  formatOpenDuration,
  leadStatusSchema,
  type Lead,
  type LeadStatus,
} from '@roofing/shared';
import { api } from '../api.js';
import type { Center } from '../App.js';

interface Props {
  center: Center | null;
  onCount: (n: number) => void;
}

export function LeadsPage({ center, onCount }: Props) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [minRoofAge, setMinRoofAge] = useState<string>('');
  const [status, setStatus] = useState<'' | LeadStatus>('');
  const [openOnly, setOpenOnly] = useState(false);
  const [minOpenYears, setMinOpenYears] = useState<string>('');
  const [radius, setRadius] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const list = await api.leads.list.query({
        minRoofAge: minRoofAge === '' ? undefined : Number(minRoofAge),
        status: status || undefined,
        openPermitsOnly: openOnly || undefined,
        minOpenYears: minOpenYears === '' ? undefined : Number(minOpenYears),
        center:
          radius !== '' && center
            ? { lat: center.lat, lon: center.lon, radiusMiles: Number(radius) }
            : undefined,
      });
      setLeads(list);
      setError(null);
      if (!minRoofAge && !status && !openOnly && !minOpenYears && !radius) onCount(list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [minRoofAge, status, openOnly, minOpenYears, radius, center, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (id: string, patch: { status?: LeadStatus; notes?: string }) => {
    await api.leads.update.mutate({ id, ...patch });
    await load();
  };
  const remove = async (id: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!window.confirm(`Delete lead for ${lead?.address ?? 'this property'}?`)) return;
    await api.leads.delete.mutate({ id });
    await load();
  };

  return (
    <div className="leads-page" data-testid="leads-page">
      <h2>
        Leads{' '}
        <span className="count" data-testid="leads-count">
          {leads.length}
        </span>
      </h2>
      <div className="lead-filters" data-testid="lead-filters">
        <label>
          Roof age ≥{' '}
          <input
            type="number"
            min={0}
            value={minRoofAge}
            placeholder={String(DEFAULTS.minRoofAge)}
            onChange={(e) => setMinRoofAge(e.target.value)}
            data-testid="lead-filter-roof-age"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | LeadStatus)}
            data-testid="lead-filter-status"
          >
            <option value="">any</option>
            {leadStatusSchema.options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            data-testid="lead-filter-open"
          />{' '}
          open permit
        </label>
        <label>
          Open ≥{' '}
          <input
            type="number"
            min={0}
            value={minOpenYears}
            placeholder={String(DEFAULTS.minOpenYears)}
            onChange={(e) => setMinOpenYears(e.target.value)}
            data-testid="lead-filter-open-years"
          />{' '}
          y
        </label>
        <label title={center ? '' : 'Drop a pin on the map first'}>
          Within{' '}
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={radius}
            placeholder="mi"
            disabled={!center}
            onChange={(e) => setRadius(e.target.value)}
            data-testid="lead-filter-radius"
          />{' '}
          mi of pin
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {leads.length === 0 && (
        <p className="muted" data-testid="leads-empty">
          No leads yet. Open a property on the map and press “Add to leads”.
        </p>
      )}
      <ul className="lead-list">
        {leads.map((l) => (
          <li key={l.id} className="lead" data-testid="lead-item" data-pin={l.pin14}>
            <div className="lead-head">
              <div>
                <strong>{l.address}</strong>
                <div className="sub">
                  PIN {l.pin14} · roof{' '}
                  {l.roofAgeYears === null ? '?' : `${l.roofAgeYears.toFixed(0)} y`}
                  {l.permitId &&
                    ` · permit ${l.permitId} ${l.permitStatus ?? ''} ${l.permitIsOpen ? `(open ${formatOpenDuration(l.openDays)})` : '(closed)'}`}
                  {` · added ${l.createdAt.slice(0, 10)}`}
                </div>
              </div>
              <select
                value={l.status}
                onChange={(e) => void update(l.id, { status: e.target.value as LeadStatus })}
                data-testid="lead-status"
                aria-label="Lead status"
              >
                {leadStatusSchema.options.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Notes"
              value={notesDraft[l.id] ?? l.notes}
              onChange={(e) => setNotesDraft({ ...notesDraft, [l.id]: e.target.value })}
              onBlur={() => {
                if (notesDraft[l.id] !== undefined && notesDraft[l.id] !== l.notes)
                  void update(l.id, { notes: notesDraft[l.id] });
              }}
              data-testid="lead-notes"
              aria-label="Lead notes"
            />
            <button
              type="button"
              className="danger"
              onClick={() => void remove(l.id)}
              data-testid="lead-delete"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
