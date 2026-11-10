import { useEffect, useState } from 'react';
import {
  CONFIDENCE_RANK,
  DEFAULT_CENTER,
  DEFAULTS,
  rankProperties,
  type Property,
  type SearchResult,
} from '@roofing/shared';
import { api } from './api.js';
import { ChatPanel } from './components/ChatPanel.js';
import { Cid, Footer, type DatasetMeta } from './components/Footer.js';
import { LeadsPage } from './components/LeadsPage.js';
import { MapView } from './components/MapView.js';
import { PropertyDrawer } from './components/PropertyDrawer.js';
import { ResultsList } from './components/ResultsList.js';
import { SearchPanel, type Filters } from './components/SearchPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { hashPage, publishedSuffix } from './lib/ui.js';

export type Center = { lat: number; lon: number };

export function App() {
  const [page, setPage] = useState(hashPage(location.hash));
  // first load: default centre so markers appear immediately; any user pin replaces it
  const [center, setCenterState] = useState<Center | null>(DEFAULT_CENTER);
  const [isDefaultCenter, setIsDefaultCenter] = useState(true);
  const setCenter = (c: Center) => {
    setIsDefaultCenter(false);
    setCenterState(c);
  };
  const [filters, setFilters] = useState<Filters>({
    radiusMiles: DEFAULTS.radiusMiles,
    minRoofAge: DEFAULTS.minRoofAge,
    openPermitsOnly: false,
    longOpenOnly: false,
    minOpenYears: DEFAULTS.minOpenYears,
    minConfidence: 'low',
  });
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Property | null>(null);
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [leadCount, setLeadCount] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => {
      setPage(hashPage(location.hash));
      setSelected(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api.meta.datasetInfo
      .query()
      .then(setMeta)
      .catch((e: unknown) => setError(String(e)));
    api.leads.list
      .query()
      .then((l) => setLeadCount(l.length))
      .catch(() => setLeadCount(null));
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.search.properties
      .query({
        lat: center.lat,
        lon: center.lon,
        radiusMiles: filters.radiusMiles,
        minRoofAge: filters.minRoofAge,
        openPermitsOnly: filters.openPermitsOnly,
        minOpenYears:
          filters.openPermitsOnly && filters.longOpenOnly ? filters.minOpenYears : undefined,
        limit: 300,
      })
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setResult(null); // never show stale rows next to an error
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [center, filters]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const addLead = async (p: Property, permitId: string | null) => {
    const permit = permitId
      ? p.permits.find((x) => x.permit_id === permitId)
      : p.permits.find((x) => x.is_roofing && x.status_is_open);
    try {
      await api.leads.create.mutate({
        pin14: p.pin14,
        address: `${p.address ?? 'address unknown'}, ${p.city ?? ''} ${p.zip ?? ''}`.trim(),
        lat: p.lat,
        lon: p.lon,
        roofAgeYears: p.roof_age_years,
        permitId: permit?.permit_id ?? null,
        permitStatus: permit?.status ?? null,
        permitIsOpen: permit?.status_is_open ?? false,
        openDays: permit?.open_days ?? null,
      });
      const leads = await api.leads.list.query();
      setLeadCount(leads.length);
      setToast(`Lead saved for PIN ${p.pin14}`);
    } catch (e) {
      setToast(`Could not save lead: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // permit toggle on: longest-open permit first (the MCP already ranks this way; re-sort so the
  // list order never depends on the dataset client)
  // client-side: drop rows whose roof-age confidence is below the selected floor ('low' = keep all)
  const confident = (result?.properties ?? []).filter(
    (p) =>
      filters.minConfidence === 'low' ||
      (p.roof_age_confidence !== null &&
        CONFIDENCE_RANK[p.roof_age_confidence] >= CONFIDENCE_RANK[filters.minConfidence]),
  );
  const properties = filters.openPermitsOnly ? rankProperties(confident) : confident;

  return (
    <div className="app">
      <Sidebar page={page} leadCount={leadCount} />
      <main className="main">
        <header className="topbar" data-testid="topbar">
          <span>
            Dataset run <code data-testid="topbar-run">{meta?.runId ?? '…'}</code>
          </span>
          <span>
            root CID <Cid cid={meta?.rootCid ?? 'pending'} testId="topbar-root-cid" />
            {publishedSuffix(meta)}
          </span>
        </header>
        {page === 'map' ? (
          <div className="map-layout">
            <section className="panel left">
              <SearchPanel
                center={center}
                isDefaultCenter={isDefaultCenter}
                onCenter={setCenter}
                filters={filters}
                onFilters={setFilters}
                loading={loading}
              />
              <ResultsList
                properties={properties}
                totalInRadius={result?.total_in_radius ?? null}
                minRoofAge={filters.minRoofAge}
                selected={selected?.pin14 ?? null}
                onSelect={setSelected}
                center={center}
                loading={loading}
                error={error}
              />
            </section>
            <section className="map-wrap">
              <MapView
                center={center}
                radiusMiles={filters.radiusMiles}
                properties={properties}
                minRoofAge={filters.minRoofAge}
                onPin={setCenter}
                onSelect={setSelected}
                selected={selected?.pin14 ?? null}
              />
            </section>
            <section className="panel right">
              <ChatPanel center={center} radiusMiles={filters.radiusMiles} />
            </section>
          </div>
        ) : (
          <LeadsPage center={center} onCount={setLeadCount} />
        )}
        <Footer
          meta={meta}
          resultCount={result ? properties.length : null}
          totalInRadius={result?.total_in_radius ?? null}
          source={result?.source ?? null}
          leadCount={leadCount}
        />
      </main>
      {selected && (
        <PropertyDrawer property={selected} onClose={() => setSelected(null)} onAddLead={addLead} />
      )}
      {toast && (
        <div className="toast" role="status" data-testid="toast">
          {toast}
        </div>
      )}
    </div>
  );
}
