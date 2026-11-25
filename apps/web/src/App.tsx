import {
  DEFAULT_COUNTY,
  type Candidate,
  type Lead,
  type LeadCreate,
  type Point,
  type SearchInput,
  type SearchResult,
} from '@roofing-crm/shared';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgentPanel } from './components/AgentPanel.js';
import { CandidateList } from './components/CandidateList.js';
import { DataView } from './components/DataView.js';
import { Notice } from './components/fields.js';
import { LeadsView } from './components/LeadsView.js';
import { MapView, type AgentPoint, type MapSelection } from './components/MapView.js';
import { Nav, type NavTarget } from './components/Nav.js';
import { PropertyDrawer } from './components/PropertyDrawer.js';
import { SearchControls } from './components/SearchControls.js';
import { useTRPC } from './lib/api.js';
import {
  addressLine,
  describeError,
  formatCount,
  formatDate,
  formatOpenDuration,
  roofAgeText,
} from './lib/format.js';
import { roundCoord } from './lib/geo.js';
import { leadFromCandidate } from './lib/leadDraft.js';
import { DEFAULT_PIN } from './lib/places.js';
import {
  DEFAULT_FILTERS,
  inCounty,
  linkPinOutsideCounty,
  parseUrlState,
  type Panel,
  type View,
} from './lib/urlState.js';
import { useDebouncedValue } from './lib/useDebouncedValue.js';
import { useLeadBook, type NoticeKind } from './lib/useLeadBook.js';
import { useUrlState } from './lib/useUrlState.js';

/** One request returns everything the list pages through; the API caps it at 500. */
export const SEARCH_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 350;

const COUNTY_SHORT = DEFAULT_COUNTY.name.replace(/, [A-Z]{2}$/, '');

const VIEW_TITLE: Record<View, string> = { map: 'Lead Map', leads: 'Leads', data: 'Data' };

interface Toast {
  id: number;
  kind: NoticeKind;
  text: string;
}

function SummaryStrip({
  result,
  stale,
  invalid,
}: {
  result: SearchResult | undefined;
  stale: boolean;
  invalid: boolean;
}) {
  const cell = (value: string | undefined): string => value ?? '–';
  return (
    <dl
      className={`summary${stale ? ' is-stale' : ''}`}
      data-testid="summary"
      aria-label="Search summary"
    >
      <div>
        <dt>Matches</dt>
        <dd data-testid="summary-total">{cell(result && formatCount(result.total))}</dd>
        {result && result.total > result.candidates.length && (
          <span className="summary-cap" data-testid="summary-capped">
            top {formatCount(result.candidates.length)} shown
          </span>
        )}
      </div>
      <div>
        <dt>Aged roofs</dt>
        <dd data-testid="summary-aged">{cell(result && formatCount(result.agedRoofCount))}</dd>
      </div>
      <div>
        <dt>Open roofing permits</dt>
        <dd data-testid="summary-permits">{cell(result && formatCount(result.openPermitCount))}</dd>
      </div>
      <div>
        <dt>Data as of</dt>
        <dd data-testid="summary-asof">{cell(result && formatDate(result.asOf))}</dd>
      </div>
      <div>
        <dt>Query time</dt>
        <dd data-testid="summary-elapsed">
          {cell(result && `${String(Math.round(result.elapsedMs))} ms`)}
        </dd>
      </div>
      {invalid && (
        <div className="summary-invalid" role="status" data-testid="results-stale">
          Not updated: these results are for the last valid search. Fix the highlighted input.
        </div>
      )}
    </dl>
  );
}

function SelectedCard({
  selection,
  candidate,
  onDetails,
  onClear,
}: {
  selection: MapSelection;
  candidate: Candidate | undefined;
  onDetails: () => void;
  onClear: () => void;
}) {
  return (
    <div className="map-overlay selected-card" data-testid="selected-card">
      <div>
        <strong>{addressLine(selection.label, selection.apn)}</strong>
        <div className="muted">
          {candidate
            ? [
                roofAgeText(candidate.roofAgeYears),
                candidate.openRoofPermits > 0
                  ? `permit ${formatOpenDuration(candidate.longestOpenDays)}`
                  : null,
                `score ${String(candidate.score)}`,
              ]
                .filter(Boolean)
                .join(' · ')
            : `APN ${selection.apn}`}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-small btn-primary"
        data-testid="selected-details"
        onClick={onDetails}
      >
        View details
      </button>
      <button
        type="button"
        className="btn btn-small btn-quiet"
        aria-label="Clear selection"
        data-testid="selected-clear"
        onClick={onClear}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}

export function App() {
  // No pin in the link: start at a well-known place so the first screen already shows leads.
  const [showMoveHint, setShowMoveHint] = useState(
    () => parseUrlState(window.location.search).pin === null,
  );
  const [url, setUrl] = useUrlState(DEFAULT_PIN);
  const { view, panel, pin, radiusMiles, filters } = url;
  const trpc = useTRPC();

  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((kind: NoticeKind, text: string) => {
    setToast({ id: Date.now(), kind, text });
  }, []);
  useEffect(() => {
    if (!toast || toast.kind === 'error') return;
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 6000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  const book = useLeadBook(notify);
  const [selected, setSelected] = useState<MapSelection | null>(null);
  const [agentPoints, setAgentPoints] = useState<AgentPoint[]>([]);
  const [highlightLeadId, setHighlightLeadId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'map' | 'panel'>('map');
  const [widePanel, setWidePanel] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(() =>
    linkPinOutsideCounty(window.location.search)
      ? `That point is outside ${COUNTY_SHORT}; showing ${DEFAULT_PIN.name} instead.`
      : null,
  );
  const [inputInvalid, setInputInvalid] = useState(false);

  const searchInput = useMemo<SearchInput | null>(
    () =>
      pin
        ? {
            center: pin,
            radiusMiles,
            minRoofAgeYears: filters.minRoofAgeYears,
            minOpenYears: filters.minOpenYears,
            signal: filters.signal,
            permitStatus: filters.permitStatus,
            sort: filters.sort,
            limit: SEARCH_LIMIT,
            offset: 0,
          }
        : null,
    [pin, radiusMiles, filters],
  );
  const [settledInput, flushSearch] = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const search = useQuery(
    trpc.search.radius.queryOptions(settledInput ?? skipToken, {
      placeholderData: keepPreviousData,
    }),
  );
  const health = useQuery(trpc.meta.health.queryOptions());
  const dataset = useQuery(trpc.meta.dataset.queryOptions());

  const result = pin ? search.data : undefined;
  const candidates = useMemo(() => result?.candidates ?? [], [result]);
  const waiting = pin !== null && (search.isFetching || settledInput !== searchInput);
  const searchError =
    pin && search.error && !search.isFetching ? describeError(search.error) : null;

  const placePin = useCallback(
    (point: Point): boolean => {
      const next = { lat: roundCoord(point.lat), lon: roundCoord(point.lon) };
      if (!inCounty(next)) {
        notify(
          'error',
          `That point is outside ${DEFAULT_COUNTY.name}. This CRM covers that county only, so the pin was not moved.`,
        );
        return false;
      }
      setLocationMessage(null);
      setSelected(null);
      setShowMoveHint(false);
      setUrl({ pin: next });
      return true;
    },
    [notify, setUrl],
  );

  const locateMe = (): void => {
    if (!('geolocation' in navigator)) {
      setLocationMessage(
        'This browser does not offer location. Click the map or use “Jump to” to place the pin.',
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const here = {
          lat: roundCoord(position.coords.latitude),
          lon: roundCoord(position.coords.longitude),
        };
        if (!inCounty(here)) {
          setLocationMessage(
            `Your location (${String(here.lat)}, ${String(here.lon)}) is outside ${DEFAULT_COUNTY.name}, the county this CRM covers. Click the map or use “Jump to” to place the pin.`,
          );
          return;
        }
        setLocationMessage(null);
        setShowMoveHint(false);
        setUrl({ pin: here });
        notify('success', 'Pin moved to your location.');
      },
      (error) => {
        setLocating(false);
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Click the map or use “Jump to” to place the pin instead.'
            : 'Your location could not be determined. Click the map or use “Jump to” to place the pin instead.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const navigate = (target: NavTarget): void => {
    setNavOpen(false);
    setUrl({ view: target.view, ...(target.panel ? { panel: target.panel } : {}) });
    if (target.view === 'map') setMobilePane(target.panel === 'agent' ? 'panel' : 'map');
  };

  const showOnMap = (point: MapSelection): void => {
    setSelected(point);
    setMobilePane('map');
    setUrl({ view: 'map', apn: null });
  };

  const openLead = (lead: Lead): void => {
    setHighlightLeadId(lead.leadId);
    setUrl({ view: 'leads', apn: null });
  };

  const createLeads = (drafts: LeadCreate[]): void => {
    void book.create(drafts);
  };

  const setPanel = (next: Panel): void => {
    setUrl({ panel: next });
    setMobilePane('panel');
  };

  const selectedCandidate = selected ? candidates.find((c) => c.apn === selected.apn) : undefined;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav
        view={view}
        panel={panel}
        leadCount={book.leads.length}
        open={navOpen}
        onNavigate={navigate}
      />
      {navOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close menu"
          onClick={() => {
            setNavOpen(false);
          }}
        />
      )}

      <div className="main" id="main">
        <header className="topbar">
          <button
            type="button"
            className="btn menu-btn"
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            data-testid="menu-button"
            onClick={() => {
              setNavOpen((open) => !open);
            }}
          >
            Menu
          </button>
          <h1 data-testid="view-title">{VIEW_TITLE[view]}</h1>
          <span className="county" data-testid="county-name">
            {DEFAULT_COUNTY.name}
          </span>
          <span className="topbar-meta" data-testid="dataset-chip">
            {dataset.data
              ? `${dataset.data.county} · data as of ${formatDate(dataset.data.asOf)}`
              : dataset.error
                ? 'Data service unavailable'
                : ''}
          </span>
        </header>

        {toast && (
          <div className="toast-wrap">
            <Notice
              kind={toast.kind}
              testId="toast"
              action={
                <button
                  type="button"
                  className="btn btn-small btn-quiet"
                  data-testid="toast-dismiss"
                  onClick={() => {
                    setToast(null);
                  }}
                >
                  Dismiss
                </button>
              }
            >
              {toast.text}
            </Notice>
          </div>
        )}

        <section
          className="mapscreen"
          hidden={view !== 'map'}
          aria-label="Lead Map"
          data-testid="map-view"
        >
          <button
            type="button"
            className="btn options-toggle"
            aria-expanded={optionsOpen}
            data-testid="options-toggle"
            onClick={() => {
              setOptionsOpen((open) => !open);
            }}
          >
            {optionsOpen ? 'Hide search options' : 'Search options (location, radius, filters)'}
          </button>
          <div className={`controls-wrap${optionsOpen ? ' is-open' : ''}`}>
            <SearchControls
              pin={pin}
              radiusMiles={radiusMiles}
              filters={filters}
              locating={locating}
              searching={waiting}
              onPin={placePin}
              onRadius={(miles) => {
                setUrl({ radiusMiles: miles });
              }}
              onFilters={(patch) => {
                setUrl((current) => ({ filters: { ...current.filters, ...patch } }));
              }}
              onUseLocation={locateMe}
              onSearch={() => {
                flushSearch();
                if (settledInput === searchInput) void search.refetch();
              }}
              onReset={() => {
                setUrl({ filters: DEFAULT_FILTERS });
              }}
              onValidity={setInputInvalid}
            />
          </div>

          {locationMessage && (
            <Notice
              kind="warn"
              testId="location-message"
              action={
                <button
                  type="button"
                  className="btn btn-small btn-quiet"
                  data-testid="location-dismiss"
                  onClick={() => {
                    setLocationMessage(null);
                  }}
                >
                  Dismiss
                </button>
              }
            >
              {locationMessage}
            </Notice>
          )}

          <SummaryStrip result={result} stale={waiting || inputInvalid} invalid={inputInvalid} />

          {result?.coverageNote && (
            <Notice kind="info" testId="coverage-note">
              <strong>Permit coverage:</strong> {result.coverageNote}
            </Notice>
          )}

          <div className="mobile-tabs" role="group" aria-label="Show">
            <button
              type="button"
              aria-pressed={mobilePane === 'map'}
              data-testid="mobile-tab-map"
              onClick={() => {
                setMobilePane('map');
              }}
            >
              Map
            </button>
            <button
              type="button"
              aria-pressed={mobilePane === 'panel' && panel === 'list'}
              data-testid="mobile-tab-list"
              onClick={() => {
                setPanel('list');
              }}
            >
              List{result ? ` (${formatCount(result.total)})` : ''}
            </button>
            <button
              type="button"
              aria-pressed={mobilePane === 'panel' && panel === 'agent'}
              data-testid="mobile-tab-agent"
              onClick={() => {
                setPanel('agent');
              }}
            >
              Ask the agent
            </button>
          </div>

          <div className="split" data-mobile-pane={mobilePane} data-wide={widePanel}>
            <div className="split-map">
              <MapView
                pin={pin}
                radiusMiles={radiusMiles}
                candidates={candidates}
                roofAgeThreshold={filters.minRoofAgeYears}
                selected={selected}
                agentPoints={agentPoints}
                hint={
                  showMoveHint ? `Showing ${DEFAULT_PIN.name}. Click the map to move the pin` : null
                }
                onPinChange={placePin}
                onSelect={setSelected}
              />
              {selected && (
                <SelectedCard
                  selection={selected}
                  candidate={selectedCandidate}
                  onDetails={() => {
                    setUrl({ apn: selected.apn });
                  }}
                  onClear={() => {
                    setSelected(null);
                  }}
                />
              )}
            </div>

            <div className="split-panel">
              <div className="tabs-row">
                <div className="tabs" role="tablist" aria-label="Side panel">
                  <button
                    type="button"
                    role="tab"
                    id="tab-list"
                    aria-selected={panel === 'list'}
                    aria-controls="tabpanel-list"
                    data-testid="tab-list"
                    onClick={() => {
                      setPanel('list');
                    }}
                  >
                    Candidates{result ? ` (${formatCount(result.total)})` : ''}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    id="tab-agent"
                    aria-selected={panel === 'agent'}
                    aria-controls="tabpanel-agent"
                    data-testid="tab-agent"
                    onClick={() => {
                      setPanel('agent');
                    }}
                  >
                    Ask the agent
                  </button>
                </div>
                <button
                  type="button"
                  className="panel-expand"
                  data-testid="panel-expand"
                  aria-pressed={widePanel}
                  title={widePanel ? 'Make the panel narrower' : 'Make the panel wider'}
                  onClick={() => {
                    setWidePanel((wide) => !wide);
                  }}
                >
                  {widePanel ? 'Collapse ›' : '‹ Expand'}
                </button>
              </div>
              <div
                className="panel-body"
                role="tabpanel"
                id="tabpanel-list"
                aria-labelledby="tab-list"
                hidden={panel !== 'list'}
              >
                <CandidateList
                  hasPin={pin !== null}
                  result={result}
                  isLoading={search.isLoading}
                  isFetching={waiting || inputInvalid}
                  error={searchError}
                  roofAgeThreshold={filters.minRoofAgeYears}
                  selectedApn={selected?.apn ?? null}
                  leadByApn={book.byApn}
                  pendingApns={book.pendingApns}
                  onSelect={(c) => {
                    setSelected({ apn: c.apn, lat: c.lat, lon: c.lon, label: c.address });
                  }}
                  onDetails={(apn) => {
                    setUrl({ apn });
                  }}
                  onAddLeads={(picked) => {
                    createLeads(picked.map(leadFromCandidate));
                  }}
                  onOpenLead={openLead}
                  onRetry={() => {
                    void search.refetch();
                  }}
                  filters={filters}
                  radiusMiles={radiusMiles}
                  onShowAged={() => {
                    setUrl((current) => ({
                      filters: {
                        ...current.filters,
                        signal: 'aged_roof',
                        permitStatus: 'any',
                        minOpenYears: 0,
                      },
                    }));
                  }}
                  onWidenRadius={(miles) => {
                    setUrl({ radiusMiles: miles });
                  }}
                  onResetFilters={() => {
                    setUrl({ filters: DEFAULT_FILTERS });
                  }}
                />
              </div>
              <div
                className="panel-body"
                role="tabpanel"
                id="tabpanel-agent"
                aria-labelledby="tab-agent"
                hidden={panel !== 'agent'}
              >
                <AgentPanel
                  pin={pin}
                  radiusMiles={radiusMiles}
                  agentModel={health.data ? health.data.agentModel : undefined}
                  pointsOnMap={agentPoints.length}
                  onShowPoints={(points) => {
                    setAgentPoints(points);
                    setMobilePane('map');
                  }}
                  onClearPoints={() => {
                    setAgentPoints([]);
                  }}
                  onOpenProperty={(apn) => {
                    setUrl({ apn });
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {view === 'leads' && (
          <LeadsView
            filters={url.leadFilters}
            pin={pin}
            book={book}
            highlightLeadId={highlightLeadId}
            onFilters={(patch) => {
              setUrl((current) => ({ leadFilters: { ...current.leadFilters, ...patch } }));
            }}
            onOpenProperty={(apn) => {
              setUrl({ apn });
            }}
            onShowOnMap={(lead) => {
              showOnMap({ apn: lead.apn, lat: lead.lat, lon: lead.lon, label: lead.address });
            }}
            onGoToMap={() => {
              navigate({ view: 'map', panel: 'list' });
            }}
          />
        )}
        {view === 'data' && <DataView />}
      </div>

      {url.apn && (
        <PropertyDrawer
          apn={url.apn}
          roofAgeThreshold={filters.minRoofAgeYears}
          lead={book.byApn.get(url.apn)}
          creating={book.pendingApns.has(url.apn)}
          onClose={() => {
            setUrl({ apn: null });
          }}
          onCreateLead={(draft) => {
            createLeads([draft]);
          }}
          onOpenLead={openLead}
          onShowOnMap={showOnMap}
        />
      )}
    </div>
  );
}
