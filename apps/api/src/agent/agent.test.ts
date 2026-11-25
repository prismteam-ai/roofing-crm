import type { DatasetSummary, PropertyDetail, SearchInput } from '@roofing-crm/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { buildContext, type Services } from '../context.js';
import { MemoryLeadStore, MemoryUsageStore } from '../leads/leadStores.js';
import type { OracleLeadRow, OraclePort, OracleQuery, OracleSearch } from '../ports.js';
import { appRouter } from '../routers/index.js';
import { askAgent } from './agent.js';

/**
 * Replay tests: the model is scripted, the Oracle port is a fake, so these check what OUR code
 * does with a model's tool calls and final text. No network, no key.
 */
const pin = { lat: 32.7157, lon: -117.1611 };

const lead: OracleLeadRow = {
  apn: '5330000200',
  address: '200 B ST',
  city: 'SAN DIEGO',
  zip: '92101',
  lat: 32.717,
  lon: -117.162,
  distanceMiles: 0.1,
  roofYear: 2012,
  roofAgeYears: 14,
  roofBasis: 'last_roofing_permit',
  roofConfidence: 'high',
  openRoofPermits: 1,
  longestOpenDays: 3100,
  topOpenPermitId: 'P2',
  topOpenContractor: 'ACME ROOFING INC',
  topOpenLicenseNo: '123456',
  ownerOccupied: false,
  lastTransferDate: '2020-03-01',
  useType: 'Assessor use code 220',
};

class ScriptedOracle implements OraclePort {
  searches: SearchInput[] = [];
  queries: string[] = [];

  searchLeads(input: SearchInput): Promise<OracleSearch> {
    this.searches.push(input);
    return Promise.resolve({
      total: 1,
      agedRoofCount: 0,
      openPermitCount: 1,
      asOf: '2026-11-25',
      coverageNote: null,
      rows: [lead],
    });
  }
  getProperty(): Promise<PropertyDetail | null> {
    return Promise.resolve(null);
  }
  datasetSummary(): Promise<DatasetSummary> {
    return Promise.reject(new Error('not used'));
  }
  schema(): Promise<string> {
    return Promise.resolve('parcel(apn, lat, lon)');
  }
  query(sql: string): Promise<OracleQuery> {
    this.queries.push(sql);
    return Promise.resolve({
      columns: ['name', 'lat', 'lon'],
      rows: [{ name: 'CHULA VISTA', kind: 'city', lat: 32.63, lon: -117.02, parcels: 67618 }],
      rowCount: 1,
      truncated: false,
      sql,
    });
  }
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

/** Replays tool calls in order, then one final text. */
function scriptedModel(
  calls: { toolName: string; input: unknown }[],
  finalText: string,
): MockLanguageModelV4 {
  let step = 0;
  return new MockLanguageModelV4({
     
    doGenerate: async () => {
      const call = calls[step];
      step += 1;
      if (call) {
        return {
          content: [
            {
              type: 'tool-call',
              toolCallId: `call-${step}`,
              toolName: call.toolName,
              input: JSON.stringify(call.input),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ type: 'text', text: finalText }],
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage,
        warnings: [],
      };
    },
  });
}

const now = (): Date => new Date('2026-11-25T18:00:00Z');
const search = { lat: 32.63, lon: -117.02, radiusMiles: 5, minOpenYears: 5, signal: 'open_permit' };

describe('askAgent, replayed', () => {
  it('looks the place up, searches, and returns evidence, rows and map points', async () => {
    const oracle = new ScriptedOracle();
    const model = scriptedModel(
      [
        { toolName: 'locatePlace', input: { name: 'Chula Vista' } },
        { toolName: 'findRoofingLeads', input: search },
      ],
      '1 property has a roofing permit open 5+ years.\n- 200 B ST, APN 5330000200: permit P2, contractor ACME ROOFING INC.\nAssumptions:\n- 5 miles around the Chula Vista centre.\n- open 5+ years.\nMissing data: BBB rating.',
    );
    const out = await askAgent(
      { oracle, model, modelName: 'scripted', now },
      { question: 'open roofing permits older than five years within five miles of Chula Vista' },
    );
    expect(out.evidence.map((e) => e.tool)).toEqual(['locatePlace', 'findRoofingLeads']);
    expect(oracle.queries[0]).toMatch(/FROM place/);
    expect(oracle.searches[0]).toMatchObject({
      center: { lat: 32.63, lon: -117.02 },
      radiusMiles: 5,
      minOpenYears: 5,
      signal: 'open_permit',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({ apn: '5330000200', score: expect.any(Number) as number });
    expect(out.points).toEqual([
      { apn: '5330000200', lat: 32.717, lon: -117.162, label: '200 B ST' },
    ]);
    expect(out.assumptions).toEqual(['5 miles around the Chula Vista centre', 'open 5+ years']);
    expect(out.answer).not.toMatch(/Check failed/);
  });

  it('flags a parcel number that no tool returned', async () => {
    const model = scriptedModel(
      [{ toolName: 'findRoofingLeads', input: search }],
      'Matches: APN 5330000200 and APN 1234567890.',
    );
    const out = await askAgent(
      { oracle: new ScriptedOracle(), model, modelName: 'scripted', now },
      { question: 'open roofing permits near here', center: pin },
    );
    expect(out.answer).toMatch(/Check failed: 1 parcel number/);
    expect(out.answer).toContain('1234567890');
  });

  it('refuses to give figures when nothing was retrieved', async () => {
    const model = scriptedModel([], 'There are 4,000 open permits in the county.');
    const out = await askAgent(
      { oracle: new ScriptedOracle(), model, modelName: 'scripted', now },
      { question: 'how many open permits are there?' },
    );
    expect(out.answer).toMatch(/could not retrieve data/);
    expect(out.answer).not.toMatch(/4,000/);
  });

  it('strips characters that could alter the place-lookup SQL', async () => {
    const oracle = new ScriptedOracle();
    const model = scriptedModel(
      [{ toolName: 'locatePlace', input: { name: "x' OR 1=1; DROP TABLE place --" } }],
      'No such place.',
    );
    await askAgent(
      { oracle, model, modelName: 'scripted', now },
      { question: 'roofs near that place' },
    );
    expect(oracle.queries[0]).not.toMatch(/'x'|;|=1/);
    expect(oracle.queries[0]).toContain("'X OR 11 DROP TABLE PLACE --'");
  });
});

describe('agent.ask daily caps', () => {
  it('stops at the per-workspace limit before calling the model, and leaves other workspaces alone', async () => {
    let modelCalls = 0;
    const model = new MockLanguageModelV4({
       
      doGenerate: async () => {
        modelCalls += 1;
        return {
          content: [{ type: 'text', text: 'Which area do you mean?' }],
          finishReason: { unified: 'stop', raw: 'end_turn' },
          usage,
          warnings: [],
        };
      },
    });
    const services: Services = {
      oracle: new ScriptedOracle(),
      leads: new MemoryLeadStore(),
      usage: new MemoryUsageStore(),
      agentLimits: { perWorkspace: 2, total: 10 },
      model,
      modelName: 'scripted',
      now,
      newId: () => 'id',
    };
    const ask = (workspace: string) =>
      appRouter
        .createCaller(buildContext(services, workspace))
        .agent.ask({ question: 'any open permits?' });

    await ask('workspace-aaaa');
    await ask('workspace-aaaa');
    await expect(ask('workspace-aaaa')).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(modelCalls).toBe(2);
    await expect(ask('workspace-bbbb')).resolves.toMatchObject({ model: 'scripted' });
    expect(modelCalls).toBe(3);
  });
});
