import {
  formatOpenDuration,
  haversineMiles,
  openRoofingPermits,
  type Property,
} from '@roofing/shared';
import type { Center } from '../App.js';
import { markerColor } from '../lib/ui.js';

interface Props {
  properties: Property[];
  totalInRadius: number | null;
  minRoofAge: number;
  selected: string | null;
  onSelect: (p: Property) => void;
  center: Center | null;
  loading: boolean;
  error: string | null;
}

export function ResultsList({
  properties,
  totalInRadius,
  minRoofAge,
  selected,
  onSelect,
  center,
  loading,
  error,
}: Props) {
  return (
    <div className="results" data-testid="results">
      <h2>
        Candidates{' '}
        <span className="count" data-testid="results-count">
          {center ? properties.length : '–'}
        </span>
      </h2>
      {error && (
        <p className="error" data-testid="search-error">
          Search failed: {error}
        </p>
      )}
      {center && !error && totalInRadius !== null && (
        <p className="muted" data-testid="results-total">
          Showing {properties.length.toLocaleString('en-US')} of{' '}
          {totalInRadius.toLocaleString('en-US')} in radius
          {totalInRadius > properties.length && ' · narrow the radius or filters to see more'}
        </p>
      )}
      {!center && <p className="muted">Drop a pin to list roofs in range.</p>}
      {center && !loading && properties.length === 0 && !error && (
        <p className="muted" data-testid="results-empty">
          No properties match these filters in this radius.
        </p>
      )}
      <ol className="result-list">
        {properties.map((p) => {
          const open = openRoofingPermits(p);
          const longest = open.reduce((a, x) => Math.max(a, x.open_days ?? 0), 0);
          return (
            <li key={p.pin14}>
              <button
                type="button"
                className={p.pin14 === selected ? 'result selected' : 'result'}
                onClick={() => onSelect(p)}
                data-testid="result-item"
                data-pin={p.pin14}
              >
                <span
                  className="dot"
                  style={{ background: markerColor(p, minRoofAge) }}
                  aria-hidden
                />
                <span className="result-main">
                  <span className="addr">
                    {p.address ?? 'address unknown'}, {p.city}
                  </span>
                  <span className="sub">
                    PIN {p.pin14} · roof{' '}
                    {p.roof_age_years === null ? '?' : `${p.roof_age_years.toFixed(0)} y`}
                    {open.length > 0 &&
                      ` · ${open.length} open permit${open.length > 1 ? 's' : ''} (${formatOpenDuration(longest)})`}
                    {center &&
                      ` · ${haversineMiles(center.lat, center.lon, p.lat, p.lon).toFixed(1)} mi`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
