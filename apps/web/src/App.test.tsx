import type { AgentAsk, LeadCreate, LeadUpdate } from '@roofing-crm/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FakeMap } from './test/fakeMapLibre.js';
import {
  AGENT_ANSWER,
  candidate,
  CANDIDATES,
  DOWNTOWN_URL,
  makeBackend,
  renderApp,
  searchResult,
  type Backend,
  type SearchInput,
} from './test/harness.js';

const DEBOUNCE = { timeout: 3000 };

async function rowsLoaded(): Promise<HTMLElement[]> {
  return screen.findAllByTestId('candidate-row', undefined, DEBOUNCE);
}

async function theMap(): Promise<FakeMap> {
  await waitFor(() => {
    expect(screen.getByTestId('map')).toHaveAttribute('data-map-ready', 'true');
  });
  const map = FakeMap.instances.at(-1);
  if (!map) throw new Error('map was not created');
  return map;
}

const lastSearch = (backend: Backend): SearchInput | undefined =>
  backend.last<SearchInput>('search.radius');

describe('Lead Map search', () => {
  it('opens on the default county and already shows leads around a default pin', async () => {
    const backend = makeBackend();
    renderApp(backend);
    expect(screen.getByTestId('county-name')).toHaveTextContent('San Diego County, CA');
    expect(screen.getByTestId('view-title')).toHaveTextContent('Lead Map');
    expect(await rowsLoaded()).toHaveLength(3);
    expect(lastSearch(backend)).toMatchObject({
      center: { lat: 32.7157, lon: -117.1611 },
      radiusMiles: 1,
    });
    await theMap();
    expect(screen.getByTestId('map-hint')).toHaveTextContent('Click the map to move the pin');
    expect(window.location.search).toBe('?lat=32.7157&lon=-117.1611');
  });

  it('drops the first-run hint once the pin is placed, and never shows it for a shared link', async () => {
    const backend = makeBackend();
    const first = renderApp(backend);
    (await theMap()).click(32.8, -117.2);
    await waitFor(() => {
      expect(screen.queryByTestId('map-hint')).not.toBeInTheDocument();
    });
    first.unmount();

    renderApp(makeBackend(), DOWNTOWN_URL);
    await theMap();
    expect(screen.queryByTestId('map-hint')).not.toBeInTheDocument();
  });

  it('searches with the defaults when a pin is dropped on the map', async () => {
    const backend = makeBackend();
    renderApp(backend);
    (await theMap()).click(32.8, -117.2);
    await waitFor(() => {
      expect(lastSearch(backend)).toEqual({
        center: { lat: 32.8, lon: -117.2 },
        radiusMiles: 1,
        minRoofAgeYears: 15,
        minOpenYears: 0,
        signal: 'any',
        permitStatus: 'any',
        sort: 'score',
        limit: 500,
        offset: 0,
      });
    }, DEBOUNCE);
  });

  it('refuses a pin outside the county and says why', async () => {
    const backend = makeBackend();
    renderApp(backend);
    (await theMap()).click(40.7, -74);
    expect(await screen.findByTestId('toast')).toHaveTextContent(/outside San Diego County, CA/);
    await rowsLoaded();
    const centres = backend.inputs<SearchInput>('search.radius').map((s) => s.center.lat);
    expect(centres.every((lat) => lat === 32.7157)).toBe(true);
  });

  it('turns every filter control into the matching search.radius input', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();

    await user.click(screen.getByTestId('signal-open_permit'));
    await user.selectOptions(screen.getByTestId('min-open-years'), '5');
    await user.selectOptions(screen.getByTestId('permit-status'), 'open');
    await user.selectOptions(screen.getByTestId('sort-select'), 'open_days');
    fireEvent.change(screen.getByTestId('roof-age-input'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('radius-slider'), { target: { value: '3.5' } });
    await user.click(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(lastSearch(backend)).toEqual({
        center: { lat: 32.7157, lon: -117.1611 },
        radiusMiles: 3.5,
        minRoofAgeYears: 20,
        minOpenYears: 5,
        signal: 'open_permit',
        permitStatus: 'open',
        sort: 'open_days',
        limit: 500,
        offset: 0,
      });
    }, DEBOUNCE);
  });

  it('searches again by itself (debounced) when a filter changes', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();
    const before = backend.inputs('search.radius').length;
    await user.click(screen.getByTestId('jump-la-jolla'));
    await waitFor(() => {
      expect(backend.inputs('search.radius').length).toBeGreaterThan(before);
      expect(lastSearch(backend)?.center).toEqual({ lat: 32.8328, lon: -117.2713 });
    }, DEBOUNCE);
  });

  it('shows the summary strip and draws candidates, radius and long-open emphasis on the map', async () => {
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();
    expect(screen.getByTestId('summary-total')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-aged')).toHaveTextContent('3');
    expect(screen.getByTestId('summary-permits')).toHaveTextContent('1');
    expect(screen.getByTestId('summary-asof')).toHaveTextContent('Nov 20, 2026');
    expect(screen.getByTestId('summary-elapsed')).toHaveTextContent('12 ms');

    const map = await theMap();
    await waitFor(() => {
      expect(map.getSource('crm-candidates')?.data.features).toHaveLength(3);
    });
    const props = map.getSource('crm-candidates')?.data.features.map((f) => f.properties);
    expect(props?.[0]).toMatchObject({ apn: '100-000-01-00', longOpen: true });
    expect(props?.[1]).toMatchObject({ longOpen: false });
    expect(map.getSource('crm-radius')?.data.features).toHaveLength(1);
    expect(screen.getByTestId('map-legend')).toHaveTextContent(/permit open 2\+ yrs/);
  });

  it('shows the API outage message with a working Retry', async () => {
    const user = userEvent.setup();
    let down = true;
    const backend = makeBackend();
    const ok = backend.handlers['search.radius'];
    backend.handlers['search.radius'] = (input) => {
      if (down)
        throw new Error('The property data service did not answer. Please try again in a moment.');
      return ok?.(input);
    };
    renderApp(backend, DOWNTOWN_URL);
    expect(await screen.findByTestId('search-error', undefined, DEBOUNCE)).toHaveTextContent(
      'The property data service did not answer',
    );
    down = false;
    await user.click(screen.getByTestId('search-retry'));
    expect(await rowsLoaded()).toHaveLength(3);
  });
});

const COVERAGE =
  'Permit records cover the City of San Diego and the unincorporated county only; El Cajon has none.';
const NOTHING = { total: 0, agedRoofCount: 0, openPermitCount: 0, candidates: [] };

describe('Permit coverage and empty results', () => {
  it('shows the coverage note under the summary whenever the API sends one', async () => {
    const backend = makeBackend({
      'search.radius': () => searchResult({ coverageNote: COVERAGE }),
    });
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();
    expect(screen.getByTestId('coverage-note')).toHaveTextContent(COVERAGE);
    expect(screen.getByTestId('coverage-note')).toHaveAttribute('role', 'status');
  });

  it('shows no coverage banner when the note is null', async () => {
    renderApp(makeBackend(), DOWNTOWN_URL);
    await rowsLoaded();
    expect(screen.queryByTestId('coverage-note')).not.toBeInTheDocument();
  });

  it('explains an empty permit search in an uncovered area and switches to aged roofs', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'search.radius': (input) => {
        const search = input as SearchInput;
        return search.signal === 'aged_roof' && search.permitStatus === 'any'
          ? searchResult({ coverageNote: COVERAGE })
          : searchResult({ ...NOTHING, coverageNote: COVERAGE });
      },
    });
    renderApp(backend, '/?lat=32.7948&lon=-116.9625&status=open&open=2');

    const empty = await screen.findByTestId('list-empty-coverage', undefined, DEBOUNCE);
    expect(empty).toHaveTextContent('that is expected');
    expect(empty).toHaveTextContent(COVERAGE);
    expect(screen.queryByTestId('empty-widen')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('empty-show-aged'));
    expect(await rowsLoaded()).toHaveLength(3);
    expect(lastSearch(backend)).toMatchObject({
      center: { lat: 32.7948, lon: -116.9625 },
      signal: 'aged_roof',
      permitStatus: 'any',
      minOpenYears: 0,
    });
    expect(screen.getByTestId('coverage-note')).toBeInTheDocument();
  });

  it('keeps the plain empty state when no permit filter is active, with widen and reset', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'search.radius': () => searchResult({ ...NOTHING, coverageNote: COVERAGE }),
    });
    renderApp(backend, '/?lat=32.7948&lon=-116.9625&r=2&age=90&sort=distance');

    await screen.findByTestId('list-empty', undefined, DEBOUNCE);
    expect(screen.queryByTestId('empty-show-aged')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-empty-coverage')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('empty-widen'));
    await waitFor(() => {
      expect(lastSearch(backend)).toMatchObject({ radiusMiles: 4, minRoofAgeYears: 90 });
    }, DEBOUNCE);
    await user.click(screen.getByTestId('empty-reset'));
    await waitFor(() => {
      expect(lastSearch(backend)).toMatchObject({
        radiusMiles: 4,
        minRoofAgeYears: 15,
        sort: 'score',
      });
    }, DEBOUNCE);
  });

  it('still offers aged roofs when a permit filter finds nothing and no note was sent', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'search.radius': (input) =>
        (input as SearchInput).signal === 'aged_roof' ? searchResult() : searchResult(NOTHING),
    });
    renderApp(backend, '/?lat=32.7948&lon=-116.9625&signal=open_permit');
    await screen.findByTestId('list-empty', undefined, DEBOUNCE);
    expect(screen.queryByTestId('coverage-note')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('empty-show-aged'));
    expect(await rowsLoaded()).toHaveLength(3);
    expect(screen.getByTestId('signal-aged_roof')).toBeChecked();
  });

  it('says plainly when only the top of a larger result is shown', async () => {
    const backend = makeBackend({ 'search.radius': () => searchResult({ total: 16014 }) });
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();
    expect(screen.getByTestId('list-capped')).toHaveTextContent('Top 3 of 16,014 shown');
    expect(screen.getByTestId('summary-capped')).toHaveTextContent('top 3 shown');
    expect(screen.getByTestId('summary-total')).toHaveTextContent('16,014');
  });
});

describe('Candidate list', () => {
  it('names the longest-open permit and its contractor under the permit badge', async () => {
    const stale = candidate('100-000-07-00', {
      address: '7 STALE WAY',
      openRoofPermits: 1,
      longestOpenDays: 11000,
      topOpenPermitId: '294814',
      topOpenContractor: null,
      topOpenLicenseNo: null,
    });
    const backend = makeBackend({
      'search.radius': () => searchResult({ candidates: [...CANDIDATES, stale], total: 4 }),
    });
    renderApp(backend, DOWNTOWN_URL);
    const rows = await rowsLoaded();
    const [first, second, , last] = rows;
    if (!first || !second || !last) throw new Error('rows missing');
    expect(within(first).getByTestId('candidate-permit-detail')).toHaveTextContent(
      'Permit RF-2020-0042 · Acme Roofing · Lic. 123456',
    );
    expect(within(first).queryByTestId('candidate-stale')).not.toBeInTheDocument();
    expect(within(second).queryByTestId('candidate-permit-detail')).not.toBeInTheDocument();
    expect(within(last).getByTestId('candidate-permit-detail')).toHaveTextContent(
      'Permit 294814 · no contractor listed',
    );
    expect(within(last).getByTestId('candidate-permit')).toHaveTextContent('open 30.1 yrs');
    const hint = within(last).getByTestId('candidate-stale');
    expect(hint).toHaveTextContent('possibly a stale record');
    expect(hint.getAttribute('title')).toMatch(/never have been finalled/);
  });

  it('renders roof age with its basis and confidence, and the open-permit duration', async () => {
    renderApp(makeBackend(), DOWNTOWN_URL);
    const [first, second] = await rowsLoaded();
    if (!first || !second) throw new Error('rows missing');
    expect(within(first).getByTestId('candidate-roof')).toHaveTextContent(
      'Roof ~22 yrs from 2004 re-roof permit · high confidence',
    );
    expect(within(first).getByTestId('candidate-permit')).toHaveTextContent(
      'Open roofing permit · open 6.2 yrs',
    );
    expect(within(second).getByTestId('candidate-roof')).toHaveTextContent(
      'Roof ~38 yrs year built 1988 · medium confidence',
    );
    expect(within(second).queryByTestId('candidate-permit')).not.toBeInTheDocument();
  });

  it('explains the score on demand', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend(), DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-score'));
    expect(within(first).getByTestId('candidate-reasons')).toHaveTextContent(
      'Roofing permit open 6.2 years (+55)',
    );
  });

  it('selecting a row highlights it on the map and offers the details', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend(), DOWNTOWN_URL);
    const rows = await rowsLoaded();
    const second = rows[1];
    if (!second) throw new Error('row missing');
    await user.click(within(second).getByTestId('candidate-select'));
    const map = await theMap();
    await waitFor(() => {
      expect(map.getSource('crm-selected')?.data.features[0]?.properties).toMatchObject({
        apn: '100-000-02-00',
      });
    });
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('selected-card')).toHaveTextContent('34 OLD ROOF AVE');
  });
});

describe('Leads', () => {
  it('converts one candidate into a lead and marks the row', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-add-lead'));

    expect(await within(first).findByTestId('candidate-open-lead')).toHaveTextContent('Lead ✓');
    expect(backend.last<LeadCreate>('leads.create')).toMatchObject({
      apn: '100-000-01-00',
      permitId: null,
      priority: 'high',
      signal: {
        roofAgeYears: 22,
        roofBasis: 'last_roofing_permit',
        openRoofPermits: 1,
        longestOpenDays: 2265,
        score: 88,
      },
    });
    expect(await screen.findByTestId('toast')).toHaveTextContent('1 lead created.');
    expect(screen.getByTestId('nav-lead-count')).toHaveTextContent('1');
  });

  it('converts several ticked candidates at once', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    const rows = await rowsLoaded();
    expect(screen.getByTestId('convert-selected')).toBeDisabled();
    for (const row of rows.slice(1)) await user.click(within(row).getByTestId('candidate-check'));
    await user.click(screen.getByTestId('convert-selected'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('2 leads created.');
    expect(backend.inputs<LeadCreate>('leads.create').map((d) => d.apn)).toEqual([
      '100-000-02-00',
      '100-000-03-00',
    ]);
    await waitFor(() => {
      expect(screen.getAllByTestId('candidate-open-lead')).toHaveLength(2);
    });
  });

  it('edits a lead in place, and puts the old value back when the API rejects it', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-add-lead'));
    await within(first).findByTestId('candidate-open-lead');

    await user.click(screen.getByTestId('nav-leads'));
    const status = await screen.findByTestId('lead-status');
    await user.selectOptions(status, 'quoted');
    await waitFor(() => {
      expect(backend.last<LeadUpdate>('leads.update')).toEqual({
        leadId: 'lead-1',
        status: 'quoted',
      });
    });
    await user.type(screen.getByTestId('lead-assignee'), 'Dana{Enter}');
    await waitFor(() => {
      expect(backend.last<LeadUpdate>('leads.update')).toEqual({
        leadId: 'lead-1',
        assignee: 'Dana',
      });
    });

    backend.handlers['leads.update'] = () => {
      throw new Error('Database is read-only');
    };
    await user.selectOptions(screen.getByTestId('lead-priority'), 'low');
    expect(await screen.findByTestId('toast')).toHaveTextContent(/change undone.*read-only/);
    await waitFor(() => {
      expect(screen.getByTestId('lead-priority')).toHaveValue('high');
    });
  });

  it('filters leads through the API and deletes only after an in-page confirm', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-add-lead'));
    await within(first).findByTestId('candidate-open-lead');
    await user.click(screen.getByTestId('nav-leads'));
    await screen.findByTestId('lead-row');

    await user.selectOptions(screen.getByTestId('lead-filter-permit'), 'yes');
    await user.selectOptions(screen.getByTestId('lead-filter-open-years'), '5');
    fireEvent.change(screen.getByTestId('lead-filter-roof-age'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('lead-filter-miles'), { target: { value: '2' } });
    await waitFor(() => {
      expect(backend.last('leads.list')).toEqual({
        hasOpenPermit: true,
        minOpenYears: 5,
        minRoofAgeYears: 20,
        near: { lat: 32.7157, lon: -117.1611 },
        radiusMiles: 2,
      });
    });
    expect(window.location.search).toContain('l_permit=yes');

    await user.click(screen.getByTestId('lead-delete'));
    expect(backend.inputs('leads.remove')).toHaveLength(0);
    await user.click(screen.getByTestId('lead-delete-no'));
    expect(screen.getByTestId('lead-row')).toBeInTheDocument();
    await user.click(screen.getByTestId('lead-delete'));
    await user.click(screen.getByTestId('lead-delete-yes'));
    await waitFor(() => {
      expect(backend.last('leads.remove')).toEqual({ leadId: 'lead-1' });
      expect(screen.queryByTestId('lead-row')).not.toBeInTheDocument();
    });
  });
});

describe('Property drawer', () => {
  it('shows permit, contractor and provenance, and never a silent blank', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-details'));

    const drawer = await screen.findByTestId('property-drawer');
    await within(drawer).findByTestId('permits-table');
    expect(backend.last('property.detail')).toEqual({ apn: '100-000-01-00' });
    expect(within(drawer).getByTestId('detail-roof-basis')).toHaveTextContent(
      'from 2004 re-roof permit',
    );
    expect(within(drawer).getByTestId('detail-owner-name')).toHaveTextContent(
      'Not in public source data',
    );
    expect(within(drawer).getByTestId('permit-duration')).toHaveTextContent('open 6.2 yrs');
    expect(within(drawer).getByTestId('permit-contractor')).toHaveTextContent('Acme Roofing');
    expect(within(drawer).getByTestId('permit-contractor')).toHaveTextContent(
      'Lic. 123456 · Active',
    );
    expect(within(drawer).getByTestId('permit-bbb')).toHaveTextContent(
      'No BBB profile matched for licence 123456.',
    );
    expect(within(drawer).getByRole('link', { name: 'City permits open data' })).toHaveAttribute(
      'href',
      'https://example.org/permit/RF-2020-0042',
    );
    expect(window.location.search).toContain('apn=100-000-01-00');

    await user.click(within(drawer).getByTestId('create-lead-from-permit'));
    await waitFor(() => {
      expect(backend.last<LeadCreate>('leads.create')).toMatchObject({
        apn: '100-000-01-00',
        permitId: 'RF-2020-0042',
        signal: { openRoofPermits: 1, longestOpenDays: 2265 },
      });
    });
    expect(await within(drawer).findByTestId('drawer-open-lead')).toBeInTheDocument();
  });
});

describe('Navigation', () => {
  it('shows the future sections as disabled placeholders', () => {
    renderApp(makeBackend());
    const future = screen.getByTestId('nav-future');
    const buttons = within(future).getAllByRole('button', { hidden: true });
    expect(buttons.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Outreach Campaigns'),
      expect.stringContaining('Estimates & Quotes'),
      expect.stringContaining('Jobs & Scheduling'),
      expect.stringContaining('Insurance Claims'),
      expect.stringContaining('Crew Dispatch'),
      expect.stringContaining('Reports & Forecasting'),
      expect.stringContaining('Integrations'),
    ]);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveTextContent('Coming soon');
    }
  });

  it('shows the dataset view with counts, sources and manifest links', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend());
    await user.click(screen.getByTestId('nav-data'));
    const manifest = await screen.findByTestId('data-manifest');
    const cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    expect(within(manifest).getByRole('link', { name: /ipfs\.io/ })).toHaveAttribute(
      'href',
      `https://ipfs.io/ipfs/${cid}`,
    );
    expect(within(manifest).getByRole('link', { name: /dweb\.link/ })).toHaveAttribute(
      'href',
      `https://dweb.link/ipfs/${cid}`,
    );
    expect(screen.getByTestId('data-counts')).toHaveTextContent('1,200');
    expect(screen.getByTestId('data-sources')).toHaveTextContent('No owner names.');
    expect(window.location.search).toBe('?view=data&lat=32.7157&lon=-117.1611');
  });
});

describe('Ask the agent', () => {
  it('sends the pin and radius, then renders answer, assumptions, evidence and rows', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(backend, `${DOWNTOWN_URL}&r=5`);
    await rowsLoaded();
    await user.click(screen.getByTestId('nav-agent'));
    await user.click(screen.getByTestId('agent-example-0'));

    const answer = await screen.findByTestId('agent-answer');
    expect(backend.last<AgentAsk>('agent.ask')).toEqual({
      question:
        'Show me open roofing permits older than five years within five miles of Chula Vista',
      center: { lat: 32.7157, lon: -117.1611 },
      radiusMiles: 5,
    });
    // The answer is text: markup in it is shown, not interpreted.
    expect(within(answer).getByTestId('agent-text').textContent).toBe(AGENT_ANSWER.answer);
    expect(within(answer).getByTestId('agent-text').querySelector('b')).toBeNull();
    expect(within(answer).getByTestId('agent-assumptions')).toHaveTextContent(
      'open at least 5 years',
    );
    const evidence = within(answer).getAllByTestId('agent-evidence-item');
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toHaveTextContent('locatePlace returned 1 row');
    expect(evidence[0]).toHaveTextContent("WHERE city = 'CHULA VISTA'");
    expect(evidence[1]).toHaveTextContent('findRoofingLeads returned 2 rows');
    expect(within(within(answer).getByTestId('agent-rows')).getAllByRole('row')).toHaveLength(3);

    await user.click(within(answer).getByTestId('agent-show-on-map'));
    const map = await theMap();
    await waitFor(() => {
      expect(map.getSource('crm-agent')?.data.features).toHaveLength(2);
    });
    expect(screen.getByTestId('lat-input')).toHaveValue(32.7157);
  });

  it('says so plainly when no model is configured', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'meta.health': () => ({ ok: true, time: 'now', agentModel: null }),
      'agent.ask': () => ({
        ...AGENT_ANSWER,
        answer: 'The assistant is not configured in this environment (no language model key).',
        assumptions: [],
        evidence: [],
        rows: [],
        points: [],
        model: 'none',
      }),
    });
    renderApp(backend, '/?panel=agent');
    expect(await screen.findByTestId('agent-status-off')).toBeInTheDocument();
    await user.type(screen.getByTestId('agent-input'), 'Any long-open permits near Escondido?');
    await user.click(screen.getByTestId('agent-submit'));
    expect(await screen.findByTestId('agent-not-configured')).toHaveTextContent('not configured');
    expect(backend.last<AgentAsk>('agent.ask')).toEqual({
      question: 'Any long-open permits near Escondido?',
      center: { lat: 32.7157, lon: -117.1611 },
      radiusMiles: 1,
    });
  });

  it('shows an agent failure with a way to try again', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'agent.ask': () => {
        throw new Error('Model timed out');
      },
    });
    renderApp(backend, '/?panel=agent');
    await user.click(screen.getByTestId('agent-example-1'));
    expect(await screen.findByTestId('agent-error')).toHaveTextContent('Model timed out');
    expect(screen.getByTestId('agent-retry')).toBeInTheDocument();
  });
});

describe('URL state', () => {
  it('restores a search from its link and writes changes back to the address bar', async () => {
    const user = userEvent.setup();
    const backend = makeBackend();
    renderApp(
      backend,
      '/?lat=32.6401&lon=-117.0842&r=2.5&signal=both&age=25&open=2&status=open&sort=distance',
    );
    await rowsLoaded();
    expect(lastSearch(backend)).toMatchObject({
      center: { lat: 32.6401, lon: -117.0842 },
      radiusMiles: 2.5,
      signal: 'both',
      minRoofAgeYears: 25,
      minOpenYears: 2,
      permitStatus: 'open',
      sort: 'distance',
    });
    expect(screen.getByTestId('signal-both')).toBeChecked();
    expect(screen.getByTestId('jump-chula-vista')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('reset-filters'));
    await waitFor(() => {
      expect(window.location.search).toBe('?lat=32.6401&lon=-117.0842&r=2.5');
    });
  });
});
