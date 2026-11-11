import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV2 } from 'ai/test';
import { FakeEmbeddingService, InMemoryTraceSink } from '@roofing/rag';
import { FixtureDatasetClient } from '../dataset/fixture.js';
import type { Property } from '@roofing/shared';
import { AGENT_LIMITS } from './limits.js';
import { areaStats, createAgent } from './agent.js';
import { gazetteerGeocoder } from './geocode.js';

const dataset = new FixtureDatasetClient();
const deps = () => ({
  dataset,
  embedder: new FakeEmbeddingService(),
  traceSink: new InMemoryTraceSink(),
  geocode: gazetteerGeocoder,
});

describe('agent offline mode', () => {
  it.each([12961, undefined])('distinguishes total %s from the returned sample', async (total) => {
    const d = deps();
    const sample = await dataset.findProperties({ lat: 41.885, lon: -87.7845, radiusMiles: 2 });
    const sampledDataset = new FixtureDatasetClient();
    vi.spyOn(sampledDataset, 'findProperties').mockResolvedValue({
      ...sample,
      total_in_radius: total,
    });
    const out = await createAgent({ ...d, dataset: sampledDataset }).ask({
      question: 'roofs older than 20 years near Oak Park',
    });
    expect(out.answer).toContain(
      total === undefined ? 'Total matches unknown' : '12961 properties match',
    );
    expect(out.answer).toContain(`Area sample (${sample.properties.length} returned properties)`);
    expect(d.traceSink.events.find((e) => e.stage === 'retrieval')?.data).toMatchObject({
      matched: total ?? null,
      sampled: sample.properties.length,
    });
  });
  it('answers the README example with citations, assumptions and missing data', async () => {
    const d = deps();
    const agent = createAgent(d);
    expect(agent.mode).toBe('offline');
    const out = await agent.ask({
      question: 'show me open roofing permits older than five years within five miles of Evanston',
    });
    expect(out.mode).toBe('offline');
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations.some((c) => c.permitId)).toBe(true);
    expect(out.answer).toMatch(/PIN \d{14}/);
    expect(out.answer).toMatch(/permit (CHI|CCA)-\d+/);
    expect(out.answer).toContain('https://');
    expect(out.answer).toContain('Assumptions:');
    expect(out.answer).toContain('Missing data:');
    expect(out.assumptions.join(' ')).toMatch(/Evanston/);
    expect(d.traceSink.events.map((e) => e.stage)).toEqual(['question', 'retrieval', 'answer']);
  });
  it('uses map center when no place is named', async () => {
    const out = await createAgent(deps()).ask({
      question: 'roofs older than 20 years',
      context: { lat: 41.885, lon: -87.7845, radiusMiles: 2 },
    });
    expect(out.assumptions.join(' ')).toMatch(/map center/);
    expect(out.assumptions.join(' ')).toMatch(/used 2 mi \(current map radius\)/);
    expect(out.answer).toMatch(/within 2 mi/);
    expect(out.answer).toMatch(/roofs >= 20 y/);
  });
  it('asks for a location when none is available', async () => {
    const out = await createAgent(deps()).ask({ question: 'any leads?' });
    expect(out.citations).toEqual([]);
    expect(out.missingData.join(' ')).toMatch(/No place/);
  });
});

describe('agent llm mode (mock model)', () => {
  it('passes total, sample, and evidence counts through the model tools', async () => {
    const sampledDataset = new FixtureDatasetClient();
    const sample = await dataset.findProperties({
      lat: 41.885,
      lon: -87.7845,
      radiusMiles: 2,
      limit: 3,
    });
    vi.spyOn(sampledDataset, 'findProperties').mockResolvedValue({
      ...sample,
      total_in_radius: 12961,
    });
    let call = 0;
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        call++;
        const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
        if (call === 1)
          return {
            content: ['find_properties', 'summarize_area'].map((toolName) => ({
              type: 'tool-call' as const,
              toolCallId: toolName,
              toolName,
              input: JSON.stringify({ lat: 41.885, lon: -87.7845, radiusMiles: 2 }),
            })),
            finishReason: 'tool-calls',
            usage,
            warnings: [],
          };
        const results = options.prompt.filter((m) => m.role === 'tool').flatMap((m) => m.content);
        expect(results.find((r) => r.toolName === 'find_properties')?.output).toMatchObject({
          type: 'json',
          value: { matched: 12961, sampled: 3, returned: 3 },
        });
        expect(results.find((r) => r.toolName === 'summarize_area')?.output).toMatchObject({
          type: 'json',
          value: { matched: 12961, sampled: 3, properties: 3 },
        });
        return {
          content: [{ type: 'text', text: '12961 matches; 3 sampled.' }],
          finishReason: 'stop',
          usage,
          warnings: [],
        };
      },
    });
    await createAgent({ ...deps(), dataset: sampledDataset, model }).ask({
      question: 'Roofing opportunities near Oak Park',
    });
    expect(call).toBe(2);
  });
  it('runs the tool loop and extracts citations from the final text', async () => {
    const d = deps();
    const pin = (
      await dataset.findProperties({
        lat: 42.0451,
        lon: -87.6877,
        radiusMiles: 3,
        openRoofingPermitsOnly: true,
      })
    ).properties[0]!.pin14;
    let call = 0;
    const model = new MockLanguageModelV2({
      doGenerate: async (options) => {
        expect(options.maxOutputTokens).toBe(AGENT_LIMITS.outputTokensPerStep);
        call++;
        const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
        if (call === 1)
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'c1',
                toolName: 'geocode_place',
                input: JSON.stringify({ query: 'Evanston' }),
              },
            ],
            finishReason: 'tool-calls',
            usage,
            warnings: [],
          };
        if (call === 2)
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'c2',
                toolName: 'find_properties',
                input: JSON.stringify({
                  lat: 42.0451,
                  lon: -87.6877,
                  radiusMiles: 3,
                  openPermitsOnly: true,
                }),
              },
            ],
            finishReason: 'tool-calls',
            usage,
            warnings: [],
          };
        return {
          content: [
            {
              type: 'text',
              text: `Best lead: PIN ${pin}.\n\nAssumptions:\n- radius 3 mi\n\nMissing data:\n- BBB rating not available`,
            },
          ],
          finishReason: 'stop',
          usage,
          warnings: [],
        };
      },
    });
    const out = await createAgent({ ...d, model }).ask({ question: 'open permits near Evanston' });
    expect(out.mode).toBe('llm');
    expect(call).toBe(3);
    expect(out.citations.some((c) => c.pin14 === pin)).toBe(true);
    expect(out.assumptions).toEqual(['radius 3 mi']);
    expect(out.missingData).toEqual(['BBB rating not available']);
    expect(d.traceSink.events.filter((e) => e.stage === 'tool').map((e) => e.data.tool)).toEqual([
      'geocode_place',
      'find_properties',
    ]);
  });
});

it('counts only open roofing properties at the labelled five-year threshold', () => {
  const p = (days: number | null, open = true, roofing = true) =>
    ({
      roof_age_years: null,
      permits: [{ is_roofing: roofing, status_is_open: open, open_days: days }],
    }) as Property;
  expect(
    areaStats([p(731), p(1826), p(1827), p(3000, false), p(3000, true, false), p(null)]),
  ).toMatchObject({ openRoofingPermits: 4, openOver5y: 1 });
});

it('bounds actual tool execution even if the model emits too many parallel calls', async () => {
  const d = deps();
  const geocode = vi.fn(gazetteerGeocoder);
  let calls = 0;
  const model = new MockLanguageModelV2({
    doGenerate: async () => {
      calls++;
      return {
        content:
          calls === 1
            ? Array.from({ length: AGENT_LIMITS.toolCalls + 1 }, (_, i) => ({
                type: 'tool-call' as const,
                toolCallId: `g${i}`,
                toolName: 'geocode_place',
                input: JSON.stringify({ query: 'Evanston' }),
              }))
            : [{ type: 'text' as const, text: 'Narrow your request.' }],
        finishReason: calls === 1 ? ('tool-calls' as const) : ('stop' as const),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
  });
  const answer = await createAgent({ ...d, model, geocode }).ask({ question: 'Evanston' });
  expect(answer.answer).toBe('Narrow your request.');
  expect(geocode).toHaveBeenCalledTimes(AGENT_LIMITS.toolCalls);
  expect(calls).toBe(2);
});

it('reserves the last model step for a final answer instead of another tool loop', async () => {
  let calls = 0;
  const model = new MockLanguageModelV2({
    doGenerate: async (options) => {
      calls++;
      const final = options.toolChoice?.type === 'none';
      return {
        content: final
          ? [{ type: 'text' as const, text: 'Final bounded answer.' }]
          : [
              {
                type: 'tool-call' as const,
                toolCallId: `step${calls}`,
                toolName: 'geocode_place',
                input: JSON.stringify({ query: 'Evanston' }),
              },
            ],
        finishReason: final ? ('stop' as const) : ('tool-calls' as const),
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
  });
  const out = await createAgent({ ...deps(), model }).ask({ question: 'Evanston' });
  expect(calls).toBe(AGENT_LIMITS.steps);
  expect(out.answer).toBe('Final bounded answer.');
});
