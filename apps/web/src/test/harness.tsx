import { createApiClient, TRPCClientError, type ApiLink } from '@roofing-crm/api-client';
import type {
  AgentAnswer,
  Candidate,
  DatasetSummary,
  Lead,
  LeadCreate,
  LeadFilter,
  LeadUpdate,
  PropertyDetail,
  SearchInput,
  SearchResult,
} from '@roofing-crm/shared';
import { observable } from '@trpc/server/observable';
import { render, type RenderResult } from '@testing-library/react';
import { App } from '../App.js';
import { Providers } from '../Providers.js';

export interface Call {
  path: string;
  input: unknown;
}

type Handler = (input: unknown) => unknown;

/**
 * A tRPC link that answers from in-memory handlers instead of the network. The real client,
 * hooks and cache run unchanged, so tests see exactly the inputs the API would receive.
 */
export function mockLink(handlers: Record<string, Handler>, calls: Call[]): ApiLink {
  return () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        Promise.resolve()
          .then(() => {
            const handler = handlers[op.path];
            if (!handler) throw new Error(`No mock for ${op.path}`);
            return handler(op.input);
          })
          .then(
            (data) => {
              observer.next({ result: { type: 'data', data } });
              observer.complete();
            },
            (cause: unknown) => {
              observer.error(
                TRPCClientError.from(cause instanceof Error ? cause : new Error(String(cause))),
              );
            },
          );
      });
}

export function candidate(apn: string, over: Partial<Candidate> = {}): Candidate {
  return {
    apn,
    address: `${apn} TEST ST`,
    city: 'SAN DIEGO',
    zip: '92101',
    lat: 32.716,
    lon: -117.161,
    distanceMiles: 0.42,
    roofYear: 1988,
    roofAgeYears: 38,
    roofBasis: 'year_built',
    roofConfidence: 'medium',
    openRoofPermits: 0,
    longestOpenDays: null,
    ownerOccupied: true,
    lastTransferDate: '2009-04-15',
    useType: 'Single Family',
    score: 38,
    scoreReasons: ['Roof about 38 years old (+33)', 'Owner-occupied (+5)'],
    ...over,
  };
}

export const CANDIDATES: Candidate[] = [
  candidate('100-000-01-00', {
    address: '12 PERMIT LN',
    roofYear: 2004,
    roofAgeYears: 22,
    roofBasis: 'last_roofing_permit',
    roofConfidence: 'high',
    openRoofPermits: 1,
    longestOpenDays: 2265,
    topOpenPermitId: 'RF-2020-0042',
    topOpenContractor: 'Acme Roofing',
    topOpenLicenseNo: '123456',
    score: 88,
    scoreReasons: ['Roofing permit open 6.2 years (+55)', 'Roof about 22 years old (+21)'],
  }),
  candidate('100-000-02-00', { address: '34 OLD ROOF AVE' }),
  candidate('100-000-03-00', {
    address: '56 THIRD CT',
    roofYear: 1975,
    roofAgeYears: 51,
    score: 40,
  }),
];

export const PROPERTY: PropertyDetail = {
  apn: '100-000-01-00',
  address: '12 PERMIT LN',
  city: 'SAN DIEGO',
  zip: '92101',
  lat: 32.716,
  lon: -117.161,
  yearBuilt: 1979,
  roofYear: 2004,
  roofAgeYears: 22,
  roofBasis: 'last_roofing_permit',
  roofConfidence: 'high',
  useType: 'Single Family',
  ownerOccupied: true,
  ownerName: null,
  ownerMailing: null,
  lastTransferDate: '2009-04-15',
  yearsSinceTransfer: 17,
  permits: [
    {
      permitId: 'RF-2020-0042',
      apn: '100-000-01-00',
      permitType: 'Building - Re-Roof',
      roofingClass: 'reroof',
      isRoofing: true,
      status: 'Issued',
      isOpen: true,
      appliedDate: '2020-09-12',
      issuedDate: '2020-09-20',
      closedDate: null,
      daysOpen: 2265,
      description: 'Tear off and re-roof.',
      contractor: {
        name: 'Acme Roofing',
        licenseNumber: '123456',
        licenseStatus: 'Active',
        classifications: 'C-39',
        phone: null,
        bbbRating: null,
        bbbUrl: null,
        bbbNote: 'No BBB profile matched for licence 123456.',
      },
      provenance: {
        source: 'City permits open data',
        sourceRecordId: 'RF-2020-0042',
        sourceUrl: 'https://example.org/permit/RF-2020-0042',
        fetchedAt: '2026-11-20T10:00:00Z',
      },
    },
  ],
  provenance: {
    source: 'County assessor roll',
    sourceRecordId: '100-000-01-00',
    sourceUrl: 'https://example.org/parcel/100-000-01-00',
    fetchedAt: '2026-11-20T10:00:00Z',
  },
};

export const AGENT_ANSWER: AgentAnswer = {
  answer: 'Two permits match.\n- 12 PERMIT LN\n<b>not bold</b>',
  assumptions: ['"Older than five years" means open at least 5 years.'],
  evidence: [
    {
      tool: 'locatePlace',
      sql: "SELECT 1 FROM property WHERE city = 'CHULA VISTA'",
      rowCount: 1,
      note: null,
    },
    { tool: 'findRoofingLeads', sql: null, rowCount: 2, note: 'radius 5 mi' },
  ],
  rows: [
    { apn: '100-000-01-00', address: '12 PERMIT LN', years_open: 6.2 },
    { apn: '100-000-09-00', address: '90 FAR RD', years_open: 5.4 },
  ],
  points: [
    { apn: '100-000-01-00', lat: 32.716, lon: -117.161, label: '12 PERMIT LN' },
    { apn: '100-000-09-00', lat: 32.64, lon: -117.08, label: '90 FAR RD' },
  ],
  model: 'test-model',
  elapsedMs: 1200,
};

export const DATASET: DatasetSummary = {
  county: 'San Diego County, CA',
  asOf: '2026-11-20',
  lastRunId: 'run-7',
  counts: [{ table: 'property', rows: 1200 }],
  sources: [
    {
      name: 'County assessor roll',
      url: 'https://example.org/roll',
      rows: 1200,
      fetchedAt: '2026-11-20T10:00:00Z',
      limits: 'No owner names.',
    },
  ],
  manifestCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
};

export interface Backend {
  calls: Call[];
  leads: Lead[];
  handlers: Record<string, Handler>;
  /** Inputs of every call to one procedure, oldest first. */
  inputs: <T>(path: string) => T[];
  last: <T>(path: string) => T | undefined;
}

export function searchResult(over: Partial<SearchResult> = {}): SearchResult {
  return {
    total: CANDIDATES.length,
    agedRoofCount: 3,
    openPermitCount: 1,
    candidates: CANDIDATES,
    coverageNote: null,
    ...over,
    asOf: '2026-11-20',
    elapsedMs: 12,
  };
}

/** A small stateful fake of the API: canned search data plus a working in-memory lead book. */
export function makeBackend(overrides: Record<string, Handler> = {}): Backend {
  const calls: Call[] = [];
  const backend: Backend = {
    calls,
    leads: [],
    handlers: {},
    inputs: <T,>(path: string) => calls.filter((c) => c.path === path).map((c) => c.input as T),
    last: <T,>(path: string) => backend.inputs<T>(path).at(-1),
  };
  let seq = 0;
  backend.handlers = {
    'search.radius': () => searchResult(),
    'property.detail': () => PROPERTY,
    'meta.health': () => ({ ok: true, time: '2026-11-25T18:00:00Z', agentModel: 'test-model' }),
    'meta.dataset': () => DATASET,
    'agent.ask': () => AGENT_ANSWER,
    'leads.list': (input) => {
      const filter = (input ?? {}) as LeadFilter;
      const leads = backend.leads.filter((l) => !filter.status || l.status === filter.status);
      return { total: backend.leads.length, leads };
    },
    'leads.create': (input) => {
      const draft = input as LeadCreate;
      const existing = backend.leads.find((l) => l.apn === draft.apn);
      if (existing) return { lead: existing, created: false };
      seq += 1;
      const lead: Lead = {
        ...draft,
        status: draft.status ?? 'new',
        leadId: `lead-${String(seq)}`,
        createdAt: '2026-11-25T18:00:00Z',
        updatedAt: '2026-11-25T18:00:00Z',
      };
      backend.leads = [lead, ...backend.leads];
      return { lead, created: true };
    },
    'leads.update': (input) => {
      const patch = input as LeadUpdate;
      const current = backend.leads.find((l) => l.leadId === patch.leadId);
      if (!current) throw new Error('Lead not found');
      const next: Lead = { ...current, ...patch, assignee: patch.assignee ?? current.assignee };
      backend.leads = backend.leads.map((l) => (l.leadId === next.leadId ? next : l));
      return next;
    },
    'leads.remove': (input) => {
      const { leadId } = input as { leadId: string };
      backend.leads = backend.leads.filter((l) => l.leadId !== leadId);
      return { removed: leadId };
    },
    ...overrides,
  };
  return backend;
}

export const DOWNTOWN_URL = '/?lat=32.7157&lon=-117.1611';

export function renderApp(backend: Backend, url = '/'): RenderResult {
  window.history.replaceState(null, '', url);
  const client = createApiClient({
    url: 'http://api.test',
    links: [mockLink(backend.handlers, backend.calls)],
  });
  return render(
    <Providers client={client}>
      <App />
    </Providers>,
  );
}

export type { SearchInput };
