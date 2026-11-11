import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { FakeEmbeddingService, InMemoryTraceSink } from '@roofing/rag';
import { createAgent } from '../agent/agent.js';
import { gazetteerGeocoder } from '../agent/geocode.js';
import { FixtureDatasetClient, filterProperties, loadFixture } from '../dataset/fixture.js';
import { LeadsRepo } from '../leads/repo.js';
import { searchRouter } from './search.js';

it('requests global rank and confidence before the MCP cap, finding a qualifying property beyond 500 nearby rows', async () => {
  const { properties, info } = loadFixture();
  const base = properties[0]!;
  const near = Array.from({ length: 501 }, (_, i) => ({
    ...base,
    pin14: String(i + 1).padStart(14, '0'),
    lat: 41.8781,
    lon: -87.6298,
    roof_age_years: 20,
    roof_age_confidence: 'low' as const,
    permits: [],
  }));
  const target = {
    ...base,
    pin14: '99999999999999',
    lat: 41.89,
    lon: -87.6298,
    roof_age_years: 100,
    roof_age_confidence: 'high' as const,
    permits: [],
  };
  const all = [...near, target];
  const query = { lat: 41.8781, lon: -87.6298, radiusMiles: 5, limit: 1 };
  expect(filterProperties(all, { ...query, sort: 'roof_age' })[0]?.pin14).toBe(target.pin14);
  expect(filterProperties(all, { ...query, minConfidence: 'high' })[0]?.pin14).toBe(target.pin14);
  const dir = mkdtempSync(join(tmpdir(), 'crm-global-ranking-'));
  const leads = new LeadsRepo(':memory:');
  try {
    writeFileSync(join(dir, 'properties.json'), JSON.stringify(all));
    writeFileSync(join(dir, 'info.json'), JSON.stringify(info));
    const dataset = new FixtureDatasetClient(dir);
    const spy = vi.spyOn(dataset, 'findProperties');
    const agent = createAgent({
      dataset,
      embedder: new FakeEmbeddingService(),
      traceSink: new InMemoryTraceSink(),
      geocode: gazetteerGeocoder,
    });
    const caller = searchRouter.createCaller({
      dataset,
      leads,
      agent,
      geocode: gazetteerGeocoder,
      workspaceId: null,
      requestId: 'global-ranking-test',
      build: { commit: 'test', builtAt: 'now' },
    });
    const result = await caller.properties({ ...query, minRoofAge: 15, minConfidence: 'high' });
    expect(result.properties.map((p) => p.pin14)).toEqual([target.pin14]);
    expect(result.total_in_radius).toBe(1);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'roof_age', minConfidence: 'high', limit: 1 }),
    );
    await caller.properties({ ...query, openPermitsOnly: true });
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'open_days', limit: 1 }));
  } finally {
    leads.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
