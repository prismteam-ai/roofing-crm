import { useState } from 'react';
import type { Center } from '../App.js';

export interface Filters {
  radiusMiles: number;
  minRoofAge: number;
  openPermitsOnly: boolean;
  longOpenOnly: boolean;
  minOpenYears: number;
}

interface Props {
  center: Center | null;
  onCenter: (c: Center) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  loading: boolean;
}

export function SearchPanel({ center, onCenter, filters, onFilters, loading }: Props) {
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lat, setLat] = useState(center ? String(center.lat) : '');
  const [lon, setLon] = useState(center ? String(center.lon) : '');
  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  const useGps = () => {
    if (!navigator.geolocation) return setGpsError('Geolocation not supported by this browser');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsError(null);
        onCenter({ lat: +pos.coords.latitude.toFixed(6), lon: +pos.coords.longitude.toFixed(6) });
      },
      (err) => setGpsError(err.message),
      { timeout: 8000 },
    );
  };
  const applyManual = () => {
    const a = Number(lat);
    const b = Number(lon);
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180)
      onCenter({ lat: a, lon: b });
  };

  return (
    <div className="search-panel" data-testid="search-panel">
      <h2>Search area</h2>
      <p className="hint">Click the map to drop a pin, use GPS, or type coordinates.</p>
      <div className="row">
        <button type="button" onClick={useGps} data-testid="use-gps">
          Use my GPS
        </button>
        {gpsError && (
          <span className="error" data-testid="gps-error">
            {gpsError}
          </span>
        )}
      </div>
      <div className="row coords">
        <input
          aria-label="Latitude"
          placeholder="lat"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          data-testid="center-lat"
          inputMode="decimal"
        />
        <input
          aria-label="Longitude"
          placeholder="lon"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          data-testid="center-lon"
          inputMode="decimal"
        />
        <button type="button" onClick={applyManual} data-testid="center-apply">
          Set pin
        </button>
      </div>
      <p className="muted" data-testid="center-readout">
        {center ? `Pin: ${center.lat.toFixed(5)}, ${center.lon.toFixed(5)}` : 'No pin yet'}
      </p>
      <label>
        Radius: <strong data-testid="radius-value">{filters.radiusMiles.toFixed(1)} mi</strong>
        <input
          type="range"
          min={0.5}
          max={10}
          step={0.5}
          value={filters.radiusMiles}
          onChange={(e) => set({ radiusMiles: Number(e.target.value) })}
          data-testid="radius-slider"
        />
      </label>
      <label>
        Roof age threshold (years)
        <input
          type="number"
          min={0}
          max={200}
          value={filters.minRoofAge}
          onChange={(e) => set({ minRoofAge: Number(e.target.value) })}
          data-testid="roof-age-input"
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={filters.openPermitsOnly}
          onChange={(e) => set({ openPermitsOnly: e.target.checked })}
          data-testid="open-permits-toggle"
        />
        Open roofing permits only
      </label>
      <label className={filters.openPermitsOnly ? 'check sub' : 'check sub off'}>
        <input
          type="checkbox"
          disabled={!filters.openPermitsOnly}
          checked={filters.longOpenOnly}
          onChange={(e) => set({ longOpenOnly: e.target.checked })}
          data-testid="long-open-toggle"
        />
        Long-open only (open ≥
        <input
          type="number"
          className="inline"
          min={0}
          max={100}
          disabled={!filters.openPermitsOnly || !filters.longOpenOnly}
          value={filters.minOpenYears}
          onChange={(e) => set({ minOpenYears: Number(e.target.value) })}
          data-testid="min-open-years"
        />
        years)
      </label>
      {loading && (
        <p className="muted" data-testid="search-loading">
          Searching…
        </p>
      )}
    </div>
  );
}
