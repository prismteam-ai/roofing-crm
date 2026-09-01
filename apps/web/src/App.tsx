import { useCallback, useEffect, useState } from 'react';
import type { LatLon } from '@roofing-crm/shared';
import { BREVARD, DEFAULT_RADIUS_MILES, DEFAULT_ROOF_AGE_THRESHOLD } from './config.js';
import { loadDataset, type DatasetState } from './lib/dataset.js';
import { queryLeadCandidates } from './lib/leads.js';
import { MapView } from './components/MapView.js';
import { Nav, type ActiveView } from './components/Nav.js';
import { DataStatus } from './components/DataStatus.js';
import { CandidateList, type CandidatesState } from './components/CandidateList.js';

export function App() {
  const [view, setView] = useState<ActiveView>('leads');
  const [dataset, setDataset] = useState<DatasetState>({ status: 'loading' });
  const [center, setCenter] = useState<LatLon | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [roofAge, setRoofAge] = useState(DEFAULT_ROOF_AGE_THRESHOLD);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidatesState>({ status: 'idle' });
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  useEffect(() => { void loadDataset().then(setDataset); }, []);

  // Re-queries DuckDB whenever the search area or roof-age threshold changes.
  // Scope note: queries `properties` only, so results are classified from
  // roof age alone (tiers B/C/UNKNOWN) -- Tier A needs the permits join,
  // which lands with the permit detail panel.
  useEffect(() => {
    if (dataset.status !== 'ready' || !center) return;
    let cancelled = false;
    setCandidates({ status: 'loading' });
    void queryLeadCandidates(dataset.source, dataset.manifest, {
      center, radiusMiles, roofAgeThreshold: roofAge,
    })
      .then((result) => { if (!cancelled) setCandidates({ status: 'ready', candidates: result }); })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCandidates({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => { cancelled = true; };
  }, [dataset, center, radiusMiles, roofAge]);

  const useMyLocation = useCallback(() => {
    setGeoError(null);
    if (!('geolocation' in navigator)) { setGeoError('This browser has no geolocation support.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setGeoError(`${err.message}. Drop a pin on the map instead.`),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  const clearSearch = useCallback(() => {
    setCenter(null);
    setCandidates({ status: 'idle' });
    setSelectedParcelId(null);
  }, []);

  return (
    <div className="layout">
      <Nav active={view} onChange={setView} />

      <main className="main">
        <header className="header">
          <div>
            <h1 className="header__title">{BREVARD.name}</h1>
            <p className="header__sub">
              Roofing lead identification — open permits first, roof age as supporting evidence.
            </p>
          </div>
        </header>

        <div className="workspace">
          <div className="workspace__map">
            <MapView
              center={center}
              radiusMiles={radiusMiles}
              candidates={candidates.status === 'ready' ? candidates.candidates : []}
              selectedParcelId={selectedParcelId}
              onPinDrop={setCenter}
              onSelectCandidate={setSelectedParcelId}
            />
          </div>

          <aside className="workspace__side">
            <section className="panel">
              <h2 className="panel__title">Search area</h2>
              <div className="row">
                <button type="button" className="btn" onClick={useMyLocation}>Use my location</button>
                <button type="button" className="btn btn--ghost" onClick={clearSearch} disabled={!center}>
                  Clear
                </button>
              </div>
              <p className="muted">
                {center
                  ? `Centred on ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`
                  : 'Click the map to drop a pin, or use your current location.'}
              </p>
              {geoError ? <p className="alert">{geoError}</p> : null}

              <label className="field" htmlFor="radius">
                <span>Radius <strong>{radiusMiles} mi</strong></span>
                <input
                  id="radius" type="range" min={0.5} max={25} step={0.5} value={radiusMiles}
                  onChange={(e) => setRadiusMiles(Number(e.target.value))}
                />
              </label>

              <label className="field" htmlFor="roofage">
                <span>Roof older than <strong>{roofAge} yrs</strong></span>
                <input
                  id="roofage" type="range" min={0} max={60} step={1} value={roofAge}
                  onChange={(e) => setRoofAge(Number(e.target.value))}
                />
              </label>
            </section>

            <CandidateList
              state={candidates}
              selectedParcelId={selectedParcelId}
              onSelect={setSelectedParcelId}
            />

            <DataStatus state={dataset} />
          </aside>
        </div>
      </main>
    </div>
  );
}
