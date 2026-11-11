import { useState } from 'react';
import { PLACES, type Confidence } from '@roofing/shared';
import { api } from '../api.js';
import type { Center } from '../App.js';

export interface Filters {
  radiusMiles: number;
  minRoofAge: number;
  openPermitsOnly: boolean;
  longOpenOnly: boolean;
  minOpenYears: number;
  minConfidence: Confidence;
}

interface Props {
  center: Center | null;
  isDefaultCenter: boolean;
  onCenter: (c: Center) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  loading: boolean;
}

export function SearchPanel({
  center,
  isDefaultCenter,
  onCenter,
  filters,
  onFilters,
  loading,
}: Props) {
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [place, setPlace] = useState('');
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
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
  const goPlace = async () => {
    const q = place.trim();
    if (!q) return;
    setPlaceMsg('Looking up…');
    try {
      const r = await api.meta.geocode.query({ query: q });
      if (!r) return setPlaceMsg(`No match for "${q}"`);
      setPlaceMsg(`Centred on ${r.displayName}`);
      onCenter({ lat: +r.lat.toFixed(6), lon: +r.lon.toFixed(6) });
    } catch (e) {
      setPlaceMsg(`Lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
      <p className="hint">
        Click the map to drop a pin, use GPS, pick a place, or type coordinates.
      </p>
      {isDefaultCenter && (
        <p className="muted" data-testid="default-centre-note">
          Default centre (Evanston); drop a pin or pick a place.
        </p>
      )}
      <label>
        Center on a place or ZIP
        <select
          value=""
          onChange={(e) => {
            const p = PLACES.find((x) => x.name === e.target.value);
            if (p) onCenter({ lat: p.lat, lon: p.lon });
          }}
          data-testid="place-select"
          aria-label="Center on a place"
        >
          <option value="">Pick a Cook County place…</option>
          {PLACES.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void goPlace();
        }}
      >
        <input
          aria-label="Place or ZIP"
          placeholder="place or ZIP, e.g. 60201"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          data-testid="place-input"
        />
        <button type="submit" data-testid="place-go" disabled={!place.trim()}>
          Go
        </button>
      </form>
      {placeMsg && (
        <p className="muted" data-testid="place-message">
          {placeMsg}
        </p>
      )}
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
      <label>
        Lowest roof-age confidence
        <select
          value={filters.minConfidence}
          onChange={(e) => set({ minConfidence: e.target.value as Confidence })}
          data-testid="confidence-select"
        >
          <option value="low">low (show all)</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
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
