import { useCallback, useEffect, useState } from 'react';
import type { LatLon } from '@roofing-crm/shared';
import { BREVARD, DEFAULT_RADIUS_MILES, DEFAULT_ROOF_AGE_THRESHOLD } from './config.js';
import { loadDataset, type DatasetState } from './lib/dataset.js';
import { MapView } from './components/MapView.js';
import { Nav, type ActiveView } from './components/Nav.js';
import { DataStatus } from './components/DataStatus.js';

export function App() {
  const [view, setView] = useState<ActiveView>('leads');
  const [dataset, setDataset] = useState<DatasetState>({ status: 'loading' });
  const [center, setCenter] = useState<LatLon | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [roofAge, setRoofAge] = useState(DEFAULT_ROOF_AGE_THRESHOLD);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => { void loadDataset().then(setDataset); }, []);

  const useMyLocation = useCallback(() => {
    setGeoError(null);
    if (!('geolocation' in navigator)) { setGeoError('This browser has no geolocation support.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setGeoError(`${err.message}. Drop a pin on the map instead.`),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
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
            <MapView center={center} radiusMiles={radiusMiles} onPinDrop={setCenter} />
          </div>

          <aside className="workspace__side">
            <section className="panel">
              <h2 className="panel__title">Search area</h2>
              <div className="row">
                <button type="button" className="btn" onClick={useMyLocation}>Use my location</button>
                <button type="button" className="btn btn--ghost" onClick={() => setCenter(null)} disabled={!center}>
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

            <DataStatus state={dataset} />
          </aside>
        </div>
      </main>
    </div>
  );
}
