import type { DatasetSummary, PropertyDetail, SearchInput } from '@roofing-crm/shared';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { askAgent } from './agent/agent.js';
import { findUnsupportedApns } from './agent/verify.js';
import { buildContext, workspaceFromHeader, type Services } from './context.js';
import { OracleUnavailableError } from './data/mcpOraclePort.js';
import { MemoryLeadStore, MemoryUsageStore } from './leads/leadStores.js';
import type { OracleLeadRow, OraclePort, OracleQuery, OracleSearch } from './ports.js';
import { appRouter } from './routers/index.js';
import { isCallerMistake } from './trpc.js';

const pin = { lat: 32.7157, lon: -117.1611 };

function row(apn: string, over: Partial<OracleLeadRow> = {}): OracleLeadRow {
  return {
    apn,
    address: `${apn} TEST ST`,
    city: 'SAN DIEGO',
    zip: '92101',
    lat: 32.716,
    lon: -117.161,
    distanceMiles: 0.2,
    roofYear: 1990,
    roofAgeYears: 36,
    roofBasis: 'year_built',
    roofConfidence: 'high',
    openRoofPermits: 0,
    longestOpenDays: null,
    ownerOccupied: null,
    lastTransferDate: null,
    useType: 'Single Family',
    ...over,
  };
}

class FakeOracle implements OraclePort {
  down = false;
  lastSearch: SearchInput | null = null;
  rows: OracleLeadRow[] = [
    row('5330000100'),
    row('5330000200', {
      roofAgeYears: 9,
      roofYear: 2017,
      roofBasis: 'last_roofing_permit',
      openRoofPermits: 1,
      longestOpenDays: 2600,
      distanceMiles: 0.9,
    }),
    row('5330000300', { roofAgeYears: 60, roofYear: 1966, distanceMiles: 0.05 }),
  ];

  async searchLeads(input: SearchInput): Promise<OracleSearch> {
    if (this.down) throw new OracleUnavailableError('down');
    this.lastSearch = input;
    return { total: 3, agedRoofCount: 2, openPermitCount: 1, asOf: '2026-11-25', rows: this.rows };
  }
  async getProperty(apn: string): Promise<PropertyDetail | null> {
    void apn;
    return null;
  }
  async datasetSummary(): Promise<DatasetSummary> {
    return {
      county: 'San Diego County, CA',
      asOf: '2026-11-25',
      lastRunId: 'run-1',
      counts: [{ table: 'property', rows: 3 }],
      sources: [],
      manifestCid: null,
    };
  }
  async schema(): Promise<string> {
    return 'property(apn, lat, lon)';
  }
  async query(sql: string): Promise<OracleQuery> {
    return { columns: [], rows: [], rowCount: 0, truncated: false, sql };
  }
}

function setup(workspace = 'workspace-aaaa') {
  const oracle = new FakeOracle();
  let n = 0;
  const services: Services = {
    oracle,
    leads: new MemoryLeadStore(),
    usage: new MemoryUsageStore(),
    agentLimits: { perWorkspace: 2, total: 3 },
    model: null,
    modelName: 'none',
    now: () => new Date('2026-11-25T18:00:00Z'),
    newId: () => `lead-${++n}`,
  };
  const caller = (ws = workspace) => appRouter.createCaller(buildContext(services, ws));
  return { oracle, services, caller };
}

const leadInput = {
  apn: '5330000200',
  permitId: 'PRJ-1',
  address: '5330000200 TEST ST',
  city: 'SAN DIEGO',
  lat: 32.716,
  lon: -117.161,
  priority: 'high' as const,
  assignee: null,
  notes: '',
  signal: {
    roofAgeYears: 9,
    roofBasis: 'last_roofing_permit' as const,
    openRoofPermits: 1,
    longestOpenDays: 2600,
    score: 72,
  },
};

describe('search.radius', () => {
  it('applies defaults at the gate and ranks the long-open permit first', async () => {
    const { caller, oracle } = setup();
    const result = await caller().search.radius({ center: pin });
    expect(oracle.lastSearch?.minRoofAgeYears).toBe(15);
    expect(oracle.lastSearch?.radiusMiles).toBe(1);
    expect(result.candidates[0]?.apn).toBe('5330000200');
    expect(result.candidates[0]?.scoreReasons.join(' ')).toMatch(/open 7\.1 years/);
    expect(result.total).toBe(3);
  });

  it('sorts by distance and by roof age on request', async () => {
    const { caller } = setup();
    const near = await caller().search.radius({ center: pin, sort: 'distance' });
    expect(near.candidates.map((c) => c.apn)).toEqual(['5330000300', '5330000100', '5330000200']);
    const old = await caller().search.radius({ center: pin, sort: 'roof_age' });
    expect(old.candidates[0]?.roofAgeYears).toBe(60);
  });

  it('rejects a bad pin before any data call', async () => {
    const { caller, oracle } = setup();
    await expect(caller().search.radius({ center: { lat: 999, lon: 0 } })).rejects.toThrow();
    expect(oracle.lastSearch).toBeNull();
  });

  it('reports a data-service outage as SERVICE_UNAVAILABLE, not a blank result', async () => {
    const { caller, oracle } = setup();
    oracle.down = true;
    await expect(caller().search.radius({ center: pin })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});

describe('leads', () => {
  it('creates once per property, updates, filters and removes', async () => {
    const { caller } = setup();
    const first = await caller().leads.create(leadInput);
    const again = await caller().leads.create(leadInput);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.lead.leadId).toBe(first.lead.leadId);

    await caller().leads.create({
      ...leadInput,
      apn: '5330000300',
      permitId: null,
      lat: 33.2,
      lon: -117.3,
      signal: { ...leadInput.signal, roofAgeYears: 60, openRoofPermits: 0, longestOpenDays: null },
    });

    const updated = await caller().leads.update({
      leadId: first.lead.leadId,
      status: 'contacted',
      notes: 'Left a voicemail',
    });
    expect(updated.status).toBe('contacted');
    expect(updated.priority).toBe('high');

    expect((await caller().leads.list({ hasOpenPermit: true })).leads).toHaveLength(1);
    expect((await caller().leads.list({ minOpenYears: 5 })).leads).toHaveLength(1);
    expect((await caller().leads.list({ minRoofAgeYears: 15 })).leads).toHaveLength(1);
    expect((await caller().leads.list({ status: 'contacted' })).leads).toHaveLength(1);
    expect((await caller().leads.list({ near: pin, radiusMiles: 2 })).leads).toHaveLength(1);
    expect((await caller().leads.list()).total).toBe(2);

    await caller().leads.remove({ leadId: first.lead.leadId });
    expect((await caller().leads.list()).total).toBe(1);
  });

  it('keeps each browser workspace separate', async () => {
    const { caller } = setup();
    await caller('workspace-aaaa').leads.create(leadInput);
    expect((await caller('workspace-bbbb').leads.list()).total).toBe(0);
    expect(workspaceFromHeader('x')).toBe('public');
    expect(workspaceFromHeader(undefined)).toBe('public');
  });

  it('refuses lead calls that carry no workspace id instead of sharing one lead book', async () => {
    const { caller } = setup();
    await expect(caller('x').leads.list()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller('x').leads.create(leadInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller('x').search.radius({ center: pin })).resolves.toMatchObject({ total: 3 });
  });

  it('returns NOT_FOUND when updating a lead that does not exist', async () => {
    const { caller } = setup();
    await expect(caller().leads.update({ leadId: 'nope', status: 'won' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('agent guards', () => {
  it('flags parcel numbers the tools never returned', () => {
    const retrieved = new Set(['5330000100', '533-000-02-00']);
    const answer = 'Top matches: 533-000-01-00, 5330000200 and 999-999-99-99.';
    expect(findUnsupportedApns(answer, retrieved)).toEqual(['999-999-99-99']);
    const withPermit = 'permit PDS1992-C-9204551999 on APN 5330000100';
    expect(findUnsupportedApns(withPermit, retrieved)).toEqual([]);
  });

  it('says plainly when no model is configured instead of inventing an answer', async () => {
    const { oracle, services } = setup();
    const out = await askAgent(
      { oracle, model: null, modelName: 'none', now: services.now },
      { question: 'open roofing permits near downtown?' },
    );
    expect(out.model).toBe('none');
    expect(out.rows).toHaveLength(0);
    expect(out.answer).toMatch(/not configured/);
  });
});

describe('failure metric', () => {
  it('treats refused requests as caller mistakes and outages as failures', () => {
    expect(isCallerMistake(new TRPCError({ code: 'BAD_REQUEST' }))).toBe(true);
    expect(isCallerMistake(new TRPCError({ code: 'NOT_FOUND' }))).toBe(true);
    expect(isCallerMistake(new TRPCError({ code: 'TOO_MANY_REQUESTS' }))).toBe(true);
    expect(isCallerMistake(new TRPCError({ code: 'INTERNAL_SERVER_ERROR' }))).toBe(false);
    expect(isCallerMistake(new TRPCError({ code: 'SERVICE_UNAVAILABLE' }))).toBe(false);
  });
});
