import type { LeadCreate, PropertyDetail } from '@roofing-crm/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { groupCandidates } from './components/CandidateList.js';
import { bbbSearchUrl, isBulkFileUrl, permitStatusGroup, useTypeLabel } from './lib/format.js';
import { FakeMap } from './test/fakeMapLibre.js';
import {
  AGENT_ANSWER,
  candidate,
  CANDIDATES,
  DOWNTOWN_URL,
  makeBackend,
  PROPERTY,
  renderApp,
  searchResult,
  type SearchInput,
} from './test/harness.js';

const WAIT = { timeout: 3000 };
const rowsLoaded = (): Promise<HTMLElement[]> =>
  screen.findAllByTestId('candidate-row', undefined, WAIT);

/** Three units of one building (the API will send `unit`), then two ordinary houses. */
function towerResult() {
  const unit = (n: number, score: number, extra: object = {}) => ({
    ...candidate(`533-000-0${String(n)}-00`, {
      address: '700 FRONT ST',
      useType: 'Assessor use code 210',
      score,
    }),
    unit: `12${String(n)}`,
    ...extra,
  });
  return searchResult({
    candidates: [unit(1, 40), unit(2, 55), unit(3, 40), ...CANDIDATES.slice(1)],
    total: 5,
  });
}

describe('Input validation', () => {
  it('explains an out-of-range latitude, keeps the pin, and marks the results as not updated', async () => {
    const backend = makeBackend();
    renderApp(backend, DOWNTOWN_URL);
    await rowsLoaded();
    const before = backend.inputs('search.radius').length;

    fireEvent.change(screen.getByTestId('lat-input'), { target: { value: '999' } });
    expect(await screen.findByTestId('latlon-error')).toHaveTextContent(
      'Latitude must be a number from -90 to 90.',
    );
    expect(screen.getByTestId('lat-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('results-stale')).toHaveTextContent('last valid search');
    expect(screen.getByTestId('search-button')).toBeDisabled();
    expect(window.location.search).toContain('lat=32.7157');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(backend.inputs('search.radius')).toHaveLength(before);

    fireEvent.change(screen.getByTestId('lat-input'), { target: { value: '32.72' } });
    await waitFor(() => {
      expect(screen.queryByTestId('latlon-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('results-stale')).not.toBeInTheDocument();
      expect(backend.last<SearchInput>('search.radius')?.center.lat).toBe(32.72);
    }, WAIT);
  });

  it('says when typed coordinates are valid numbers but outside the county', async () => {
    renderApp(makeBackend(), DOWNTOWN_URL);
    await rowsLoaded();
    fireEvent.change(screen.getByTestId('lat-input'), { target: { value: '34.05' } });
    expect(await screen.findByTestId('latlon-error')).toHaveTextContent(
      /outside San Diego County .*The pin was not moved/,
    );
    expect(window.location.search).toContain('lat=32.7157');
  });

  it('explains an out-of-range radius and roof-age threshold next to the box', async () => {
    renderApp(makeBackend(), DOWNTOWN_URL);
    await rowsLoaded();
    fireEvent.change(screen.getByTestId('radius-input'), { target: { value: '99' } });
    expect(await screen.findByTestId('radius-input-error')).toHaveTextContent(
      'Enter a number from 0.25 to 25',
    );
    expect(screen.getByTestId('results-stale')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('radius-input'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('roof-age-input'), { target: { value: '-5' } });
    expect(await screen.findByTestId('roof-age-input-error')).toHaveTextContent(
      'Enter a whole number from 0 to 150',
    );
    expect(screen.queryByTestId('radius-input-error')).not.toBeInTheDocument();
  });

  it('tells the reader when a link pointed outside the county and Downtown is shown instead', async () => {
    const backend = makeBackend();
    renderApp(backend, '/?lat=34.05&lon=-118.25');
    expect(screen.getByTestId('location-message')).toHaveTextContent(
      'That point is outside San Diego County; showing Downtown San Diego instead.',
    );
    await rowsLoaded();
    expect(backend.last<SearchInput>('search.radius')?.center).toEqual({
      lat: 32.7157,
      lon: -117.1611,
    });
  });
});

describe('Units at one address', () => {
  it('groups consecutive same-address rows, best score first', () => {
    const groups = groupCandidates(towerResult().candidates);
    expect(groups.map((g) => g.members.length)).toEqual([3, 1, 1]);
    expect(groups[0]?.members.map((c) => c.score)).toEqual([55, 40, 40]);
    const apart = [CANDIDATES[0], CANDIDATES[1], CANDIDATES[0]].flatMap((c) => (c ? [c] : []));
    expect(groupCandidates(apart)).toHaveLength(3);
  });

  it('shows one expandable row per building, with unit and APN on each unit row', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend({ 'search.radius': towerResult }), DOWNTOWN_URL);
    const group = await screen.findByTestId('candidate-group', undefined, WAIT);
    expect(within(group).getByTestId('group-toggle')).toHaveTextContent('700 FRONT ST · 3 units');
    expect(screen.getAllByTestId('candidate-row')).toHaveLength(2);
    expect(screen.getByTestId('page-status')).toHaveTextContent('1–3 of 3 rows (5 properties)');

    await user.click(within(group).getByTestId('group-toggle'));
    const units = within(group).getAllByTestId('candidate-row');
    expect(units.map((u) => within(u).getByTestId('candidate-select').textContent)).toEqual([
      '700 FRONT ST #122',
      '700 FRONT ST #121',
      '700 FRONT ST #123',
    ]);
    const first = units[0];
    if (!first) throw new Error('unit row missing');
    expect(within(first).getByTestId('candidate-apn')).toHaveTextContent('APN 533-000-02-00');
    expect(within(first).getByText('Use code 210')).toHaveAttribute(
      'title',
      'County assessor land-use code',
    );
  });

  it('converts every unit of a building, or one, and keeps bulk selection working', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({ 'search.radius': towerResult });
    renderApp(backend, DOWNTOWN_URL);
    const group = await screen.findByTestId('candidate-group', undefined, WAIT);

    await user.click(within(group).getByTestId('group-expand'));
    const unit = within(group).getAllByTestId('candidate-row')[1];
    if (!unit) throw new Error('unit row missing');
    await user.click(within(unit).getByTestId('candidate-add-lead'));
    await within(unit).findByTestId('candidate-open-lead');
    expect(backend.inputs<LeadCreate>('leads.create').map((d) => d.apn)).toEqual(['533-000-01-00']);

    expect(within(group).getByTestId('group-add-all')).toHaveTextContent('Add all 2 as leads');
    await user.click(within(group).getByTestId('group-add-all'));
    await waitFor(() => {
      expect(within(group).getByTestId('group-add-all')).toHaveTextContent('All are leads');
    });
    expect(backend.inputs<LeadCreate>('leads.create').map((d) => d.apn)).toEqual([
      '533-000-01-00',
      '533-000-02-00',
      '533-000-03-00',
    ]);
  });

  it('ticking a building selects all of its units for "Convert selected"', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({ 'search.radius': towerResult });
    renderApp(backend, DOWNTOWN_URL);
    const group = await screen.findByTestId('candidate-group', undefined, WAIT);
    await user.click(within(group).getByTestId('group-check'));
    expect(screen.getByTestId('convert-selected')).toHaveTextContent('(3)');
    await user.click(screen.getByTestId('convert-selected'));
    expect(await screen.findByTestId('toast')).toHaveTextContent('3 leads created.');
  });

  it('opens the building when one of its units is picked on the map', async () => {
    const backend = makeBackend({ 'search.radius': towerResult });
    renderApp(backend, DOWNTOWN_URL);
    await screen.findByTestId('candidate-group', undefined, WAIT);
    const map = FakeMap.instances.at(-1);
    if (!map) throw new Error('no map');
    map.queryRenderedFeatures = () => [
      { properties: { apn: '533-000-03-00', lat: 32.716, lon: -117.161, label: '700 FRONT ST' } },
    ];
    map.click(32.716, -117.161);
    const selected = await screen.findByText('700 FRONT ST #123');
    expect(selected.closest('[data-testid="candidate-row"]')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});

describe('Property drawer on real-data shapes', () => {
  const detail = {
    ...PROPERTY,
    unit: '1204',
    useType: 'Assessor use code 210',
    permits: PROPERTY.permits.flatMap((permit) => [
      {
        ...permit,
        statusGroup: 'open',
        provenance: {
          ...permit.provenance,
          sourceUrl: 'https://seshat.datasd.org/development_permits/approvals_active_datasd.csv',
        },
      },
      {
        ...permit,
        permitId: 'PMT-777',
        status: 'In Review',
        statusGroup: 'pending',
        isOpen: false,
        issuedDate: null,
        contractor: null,
      },
    ]),
  } as PropertyDetail;

  it('labels a bulk-file source, offers a BBB lookup, and shows unit, use code and status group', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend({ 'property.detail': () => detail }), DOWNTOWN_URL);
    const [first] = await rowsLoaded();
    if (!first) throw new Error('row missing');
    await user.click(within(first).getByTestId('candidate-details'));
    const drawer = await screen.findByTestId('property-drawer');
    await within(drawer).findByTestId('permits-table');

    expect(within(drawer).getByTestId('drawer-title')).toHaveTextContent('12 PERMIT LN #1204');
    expect(within(drawer).getByText('Use code 210')).toHaveAttribute(
      'title',
      'County assessor land-use code',
    );

    const bulk = within(drawer).getByTestId('source-bulk');
    expect(bulk).toHaveTextContent('Source dataset (bulk file, seshat.datasd.org)');
    expect(within(drawer).getAllByTestId('permit-source')[0]).toHaveTextContent(
      'record RF-2020-0042',
    );

    const lookups = within(drawer).getAllByTestId('bbb-lookup');
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toHaveAttribute(
      'href',
      'https://www.bbb.org/search?find_text=Acme%20Roofing&find_loc=San%20Diego%2C%20CA',
    );
    expect(lookups[0]).toHaveAttribute('target', '_blank');
    expect(lookups[0]?.getAttribute('rel')).toContain('noopener');
    expect(within(drawer).queryByRole('link', { name: 'BBB profile' })).not.toBeInTheDocument();

    const badges = within(drawer).getAllByTestId('permit-status-badge');
    expect(badges.map((b) => b.textContent)).toEqual(['Open', 'Pending (applied, not issued)']);
    expect(badges[1]).toHaveAttribute('data-status-group', 'pending');
    expect(drawer).toHaveTextContent('Source status: In Review');
  });
});

describe('Data page and agent details', () => {
  it('lists plain-HTTP gateways first and explains the browser-only ones', async () => {
    const user = userEvent.setup();
    renderApp(makeBackend());
    await user.click(screen.getByTestId('nav-data'));
    const manifest = await screen.findByTestId('data-manifest');
    const hosts = within(manifest)
      .getAllByRole('link')
      .map((link) => new URL(link.getAttribute('href') ?? '').host);
    expect(hosts).toEqual([
      'latam.orbitor.dev',
      'gateway.pinata.cloud',
      'ipfs.filebase.io',
      'ipfs.io',
      'dweb.link',
    ]);
    expect(within(manifest).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      'https://latam.orbitor.dev/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    );
    expect(screen.getByTestId('data-manifest-note')).toHaveTextContent(
      'ipfs.io and dweb.link serve only interactive browsers',
    );
  });

  it('shows how many rows were retrieved when the table holds fewer', async () => {
    const user = userEvent.setup();
    const backend = makeBackend({
      'agent.ask': () => ({
        ...AGENT_ANSWER,
        evidence: [{ tool: 'findRoofingLeads', sql: null, rowCount: 270, note: null }],
      }),
    });
    renderApp(backend, '/?panel=agent');
    await user.click(screen.getByTestId('agent-example-0'));
    expect(await screen.findByTestId('agent-rows-count')).toHaveTextContent(
      '(showing 2 of 270 retrieved)',
    );
  });
});

describe('helpers', () => {
  it('recognise bulk files, use codes, status groups and build the BBB search link', () => {
    expect(isBulkFileUrl('https://seshat.datasd.org/x/approvals_active_datasd.csv')).toBe(true);
    expect(isBulkFileUrl('https://geo.sandag.org/server/rest/FeatureServer/0/query?f=json')).toBe(
      false,
    );
    expect(useTypeLabel('Assessor use code 210')).toEqual({
      text: 'Use code 210',
      hint: 'County assessor land-use code',
    });
    expect(useTypeLabel('Single Family')).toEqual({ text: 'Single Family', hint: null });
    expect(permitStatusGroup('PENDING')).toBe('pending');
    expect(permitStatusGroup('something new')).toBe('other');
    expect(permitStatusGroup(null)).toBe('other');
    expect(bbbSearchUrl('Luna Lounge, Denise Luna')).toBe(
      'https://www.bbb.org/search?find_text=Luna%20Lounge&find_loc=San%20Diego%2C%20CA',
    );
  });
});
