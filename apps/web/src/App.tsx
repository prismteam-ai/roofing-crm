import { useCallback, useEffect, useState } from 'react';
import { addNote, advanceStage, type CrmLead, type CrmStage, type LatLon } from '@roofing-crm/shared';
import { BREVARD, DEFAULT_RADIUS_MILES, DEFAULT_ROOF_AGE_THRESHOLD } from './config.js';
import { loadDataset, type DatasetState } from './lib/dataset.js';
import { queryLeadCandidates, type LeadCandidate } from './lib/leads.js';
import { countUnlocatableOpenRoofingPermits, queryOpenRoofingPermitLeads } from './lib/permits.js';
import {
  createLeadFromCandidate, deleteLead, exportLeadsJson, importLeadsJson,
  listLeads, putLead, seedDemoLeadsIfNeeded,
} from './lib/crmStore.js';
import { MapView } from './components/MapView.js';
import { Nav, type ActiveView } from './components/Nav.js';
import { DataStatus } from './components/DataStatus.js';
import { CandidateList, type CandidatesState } from './components/CandidateList.js';
import { DetailPanel } from './components/DetailPanel.js';
import { Pipeline } from './components/Pipeline.js';
import { AgentChat, type ChatMessage } from './components/AgentChat.js';
import { answerQuestion, type AgentAnswer } from './lib/agent.js';

const OWNER_STORAGE_KEY = 'roofing-crm:owner-name';

export function App() {
  const [view, setView] = useState<ActiveView>('leads');
  const [dataset, setDataset] = useState<DatasetState>({ status: 'loading' });
  const [center, setCenter] = useState<LatLon | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [roofAge, setRoofAge] = useState(DEFAULT_ROOF_AGE_THRESHOLD);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidatesState>({ status: 'idle' });
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);
  const [unlocatableOpenPermits, setUnlocatableOpenPermits] = useState<number | null>(null);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [ownerName, setOwnerName] = useState<string>(
    () => (typeof localStorage !== 'undefined' && localStorage.getItem(OWNER_STORAGE_KEY)) || 'Alex',
  );

  useEffect(() => { void loadDataset().then(setDataset); }, []);
  useEffect(() => { localStorage.setItem(OWNER_STORAGE_KEY, ownerName); }, [ownerName]);

  const refreshLeads = useCallback(() => { void listLeads().then(setLeads); }, []);
  useEffect(() => { refreshLeads(); }, [refreshLeads]);

  // One-time, real-data seed so the pipeline board isn't empty on arrival --
  // a wide search around the county centre, independent of the user's own
  // search state. See crmStore.seedDemoLeadsIfNeeded for the honesty rules.
  useEffect(() => {
    if (dataset.status !== 'ready') return;
    void seedDemoLeadsIfNeeded(() =>
      queryOpenRoofingPermitLeads(dataset.source, dataset.manifest, {
        center: BREVARD.center, radiusMiles: 25, limit: 10,
      }),
    ).then((seeded) => { if (seeded.length > 0) refreshLeads(); });
  }, [dataset, refreshLeads]);

  // County-wide, not radius-scoped -- computed once per dataset, not per search.
  useEffect(() => {
    if (dataset.status !== 'ready') return;
    let cancelled = false;
    void countUnlocatableOpenRoofingPermits(dataset.source, dataset.manifest)
      .then((n) => { if (!cancelled) setUnlocatableOpenPermits(n); })
      .catch(() => { if (!cancelled) setUnlocatableOpenPermits(null); });
    return () => { cancelled = true; };
  }, [dataset]);

  // Re-queries DuckDB whenever the search area or roof-age threshold changes.
  // Two queries, merged: roof-age-filtered properties (tiers B/C) and open
  // roofing permits joined to their matched property (tier A). Where a
  // parcel appears in both, the tier-A version wins and the B/C duplicate is
  // dropped -- mirroring classifyTier's own "open permit wins regardless of
  // basis" rule, just split across two queries so browsing by roof age
  // doesn't pay for a permits join every time.
  useEffect(() => {
    if (dataset.status !== 'ready' || !center) return;
    let cancelled = false;
    setCandidates({ status: 'loading' });
    void Promise.all([
      queryLeadCandidates(dataset.source, dataset.manifest, { center, radiusMiles, roofAgeThreshold: roofAge }),
      queryOpenRoofingPermitLeads(dataset.source, dataset.manifest, { center, radiusMiles }),
    ])
      .then(([byRoofAge, byOpenPermit]) => {
        if (cancelled) return;
        const tierAParcelIds = new Set(byOpenPermit.map((c) => c.parcelId));
        const merged: LeadCandidate[] = [
          ...byOpenPermit,
          ...byRoofAge.filter((c) => !tierAParcelIds.has(c.parcelId)),
        ].sort((a, b) => a.distanceMiles - b.distanceMiles);
        setCandidates({ status: 'ready', candidates: merged });
      })
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

  const handleAddToLeads = useCallback((candidate: LeadCandidate) => {
    void putLead(createLeadFromCandidate(candidate, ownerName)).then(refreshLeads);
  }, [ownerName, refreshLeads]);

  const handleAdvanceStage = useCallback((lead: CrmLead, stage: CrmStage) => {
    void putLead(advanceStage(lead, stage, ownerName)).then(refreshLeads);
  }, [ownerName, refreshLeads]);

  const handleAddNote = useCallback((lead: CrmLead, text: string) => {
    void putLead(addNote(lead, text, ownerName)).then(refreshLeads);
  }, [ownerName, refreshLeads]);

  const handleDeleteLead = useCallback((lead: CrmLead) => {
    void deleteLead(lead.id).then(refreshLeads);
  }, [refreshLeads]);

  const handleExport = useCallback(() => {
    void exportLeadsJson().then((json) => {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `roofing-crm-leads-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  const handleImport = useCallback((file: File) => {
    void file.text()
      .then((json) => importLeadsJson(json))
      .then(refreshLeads)
      .catch((err: unknown) => {
        window.alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [refreshLeads]);

  const handleViewOnMap = useCallback((lead: CrmLead) => {
    setView('leads');
    setCenter({ lat: lead.lat, lon: lead.lon });
  }, []);

  const handleSelectCitation = useCallback((parcelId: string, citationCenter: LatLon) => {
    setView('leads');
    setCenter(citationCenter);
    setSelectedParcelId(parcelId);
  }, []);

  const handleAsk = useCallback((question: string) => {
    if (dataset.status !== 'ready' || chatLoading) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    setChatMessages((prev) => [...prev, { id: `${Date.now()}_u`, role: 'user', text: trimmed }]);
    setChatLoading(true);
    void answerQuestion(trimmed, dataset.source, dataset.manifest)
      .then((answer: AgentAnswer) => {
        setChatMessages((prev) => [...prev, {
          id: `${Date.now()}_a`, role: 'assistant', text: answer.text,
          citations: answer.citations, usedLlm: answer.usedLlm, centerUsed: answer.centerUsed,
        }]);
      })
      .catch((err: unknown) => {
        setChatMessages((prev) => [...prev, {
          id: `${Date.now()}_a`, role: 'assistant',
          text: `Something went wrong answering that: ${err instanceof Error ? err.message : String(err)}`,
        }]);
      })
      .finally(() => setChatLoading(false));
  }, [dataset, chatLoading]);

  const selectedCandidate = selectedParcelId && candidates.status === 'ready'
    ? candidates.candidates.find((c) => c.parcelId === selectedParcelId) ?? null
    : null;
  const existingLeadId = selectedCandidate
    ? leads.find((l) => l.parcelId === selectedCandidate.parcelId)?.id ?? null
    : null;

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

        {view === 'leads' ? (
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
              <DetailPanel
                candidate={selectedCandidate}
                onClose={() => setSelectedParcelId(null)}
                existingLeadId={existingLeadId}
                onAddToLeads={handleAddToLeads}
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

              <DataStatus state={dataset} unlocatableOpenPermits={unlocatableOpenPermits} />
            </aside>
          </div>
        ) : view === 'pipeline' ? (
          <Pipeline
            leads={leads}
            ownerName={ownerName}
            onOwnerNameChange={setOwnerName}
            onAdvanceStage={handleAdvanceStage}
            onAddNote={handleAddNote}
            onDelete={handleDeleteLead}
            onExport={handleExport}
            onImport={handleImport}
            onViewOnMap={handleViewOnMap}
          />
        ) : dataset.status === 'ready' ? (
          <AgentChat
            messages={chatMessages}
            loading={chatLoading}
            onAsk={handleAsk}
            onSelectCitation={handleSelectCitation}
          />
        ) : (
          <div className="pipeline">
            <p className="muted">Waiting for the dataset before the agent can answer questions.</p>
          </div>
        )}
      </main>
    </div>
  );
}
