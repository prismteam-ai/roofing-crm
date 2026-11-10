import { describe, expect, it } from 'vitest';
import { MockLanguageModelV2 } from 'ai/test';
import { FakeEmbeddingService, InMemoryTraceSink } from '@roofing/rag';
import { FixtureDatasetClient } from '../dataset/fixture.js';
import { createAgent } from './agent.js';
import { gazetteerGeocoder } from './geocode.js';

const dataset = new FixtureDatasetClient();
const deps = () => ({
  dataset,
  embedder: new FakeEmbeddingService(),
  traceSink: new InMemoryTraceSink(),
  geocode: gazetteerGeocoder,
});

describe('agent offline mode', () => {
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
    expect(out.answer).toMatch(/roofs >= 20 y/);
  });
  it('asks for a location when none is available', async () => {
    const out = await createAgent(deps()).ask({ question: 'any leads?' });
    expect(out.citations).toEqual([]);
    expect(out.missingData.join(' ')).toMatch(/No place/);
  });
});

describe('agent llm mode (mock model)', () => {
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
      doGenerate: async () => {
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
