import type { DatasetSummary, PropertyDetail } from '@roofing-crm/shared';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { OracleLeadRow, OraclePort, OracleQuery, OracleSearch } from '../ports.js';
import { askAgent, summarizeRows } from './agent.js';

/**
 * Seen on the live site: the model ran its tools and then returned no prose, so the user got a
 * table with an empty answer. These tests pin the two-step fallback.
 */
const row: OracleLeadRow = {
  apn: '5330000200',
  address: '200 B ST',
  unit: '4',
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
  useType: null,
};

const oracle: OraclePort = {
  searchLeads: (): Promise<OracleSearch> =>
    Promise.resolve({
      total: 22,
      agedRoofCount: 0,
      openPermitCount: 22,
      asOf: '2026-11-25',
      coverageNote: null,
      rows: [row],
    }),
  getProperty: (): Promise<PropertyDetail | null> => Promise.resolve(null),
  datasetSummary: (): Promise<DatasetSummary> => Promise.reject(new Error('not used')),
  schema: (): Promise<string> => Promise.resolve('parcel(apn)'),
  query: (sql: string): Promise<OracleQuery> =>
    Promise.resolve({ columns: [], rows: [], rowCount: 0, truncated: false, sql }),
};

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

/** First call: one tool call. Later calls: the given texts in order (the last one repeats). */
function model(texts: string[]): { model: MockLanguageModelV4; calls: () => number } {
  let step = 0;
  const mock = new MockLanguageModelV4({
    doGenerate: async () => {
      step += 1;
      if (step === 1) {
        return {
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'findRoofingLeads',
              input: JSON.stringify({
                lat: 32.63,
                lon: -117.02,
                radiusMiles: 5,
                minOpenYears: 5,
                signal: 'open_permit',
              }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_use' },
          usage,
          warnings: [],
        };
      }
      const text = texts[Math.min(step - 2, texts.length - 1)] ?? '';
      return {
        content: text === '' ? [] : [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'end_turn' },
        usage,
        warnings: [],
      };
    },
  });
  return { model: mock, calls: () => step };
}

const now = (): Date => new Date('2026-11-25T18:00:00Z');
const ask = {
  question: 'open roofing permits older than five years within five miles of Chula Vista',
};

describe('agent answer fallback', () => {
  it('asks once more, without tools, when the model wrote nothing after its tool calls', async () => {
    const m = model([
      '',
      '22 properties have a roofing permit open 5+ years.\n- 200 B ST #4, APN 5330000200: permit P2.',
    ]);
    const out = await askAgent({ oracle, model: m.model, modelName: 'scripted', now }, ask);
    expect(m.calls()).toBe(3);
    expect(out.answer).toMatch(/^22 properties/);
    expect(out.rows).toHaveLength(1);
    expect(out.answer).not.toMatch(/Check failed/);
  });

  it('lists the retrieved rows itself when the retry is empty too', async () => {
    const m = model(['']);
    const out = await askAgent({ oracle, model: m.model, modelName: 'scripted', now }, ask);
    expect(out.answer).toMatch(/^22 matching records were retrieved/);
    expect(out.answer).toContain('200 B ST #4, APN 5330000200');
    expect(out.answer).toContain('permit P2 open 8.5 years, ACME ROOFING INC');
    expect(out.assumptions[0]).toMatch(/plain listing/);
  });

  it('builds the listing from rows alone', () => {
    const text = summarizeRows(
      [
        { ...row, score: 80 },
        { apn: '1', address: null },
      ],
      2,
    );
    expect(text.split('\n')).toHaveLength(4);
    expect(text).toContain('Address not recorded, APN 1');
    expect(text).toContain('roof about 14 years (last roofing permit)');
  });
});
