import { afterAll, describe, expect, it } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { FakeEmbeddingService, InMemoryTraceSink } from '@roofing/rag';
import { createAgent } from './agent/agent.js';
import { gazetteerGeocoder } from './agent/geocode.js';
import { createApp } from './app.js';
import { FixtureDatasetClient } from './dataset/fixture.js';
import { LeadsRepo } from './leads/repo.js';
import type { AppRouter } from './routers/index.js';

const dataset = new FixtureDatasetClient();
const leads = new LeadsRepo(':memory:');
const agent = createAgent({
  dataset,
  embedder: new FakeEmbeddingService(),
  traceSink: new InMemoryTraceSink(),
  geocode: gazetteerGeocoder,
});
const app = createApp({
  dataset,
  leads,
  agent,
  geocode: gazetteerGeocoder,
  build: { commit: 'test', builtAt: 'now' },
});
afterAll(() => leads.close());

const client = (workspaceId?: string) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://local/trpc',
        headers: workspaceId ? { 'x-workspace-id': workspaceId } : {},
        fetch: (url, init) => app.request(String(url), init as RequestInit),
      }),
    ],
  });

describe('http endpoints', () => {
  it('serves /health and /build.json', async () => {
    const h = await app.request('/health');
    expect(h.status).toBe(200);
    expect(await h.json()).toMatchObject({ ok: true, dataset: 'fixture', agent: 'offline' });
    expect(await (await app.request('/build.json')).json()).toEqual({
      commit: 'test',
      builtAt: 'now',
    });
    expect(h.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('tRPC routers', () => {
  const c = client('ws-test');
  it('meta.geocode resolves gazetteer places and returns null for unknown', async () => {
    expect(await c.meta.geocode.query({ query: 'Skokie' })).toMatchObject({ lat: 42.0324 });
    expect(await c.meta.geocode.query({ query: 'nowhere-xyz' })).toBeNull();
  });
  it('search.properties returns ranked rows and source', async () => {
    const r = await c.search.properties.query({
      lat: 41.8781,
      lon: -87.6298,
      radiusMiles: 5,
      minRoofAge: 15,
    });
    expect(r.properties.length).toBeGreaterThan(0);
    expect(r.source.runId).toBeTruthy();
  });
  it('search validates input', async () => {
    await expect(c.search.properties.query({ lat: 200, lon: 0 })).rejects.toThrow();
  });
  it('property.get round-trips', async () => {
    const pin = (await c.search.properties.query({ lat: 41.8781, lon: -87.6298, radiusMiles: 5 }))
      .properties[0]!.pin14;
    expect((await c.property.get.query({ pin14: pin })).property?.pin14).toBe(pin);
  });
  it('leads CRUD scoped by workspace header', async () => {
    const lead = await c.leads.create.mutate({
      pin14: '12345678901234',
      address: 'x',
      lat: 41.9,
      lon: -87.7,
      roofAgeYears: 30,
    });
    expect(lead.status).toBe('new');
    expect((await c.leads.list.query()).length).toBe(1);
    expect((await client('other').leads.list.query()).length).toBe(0);
    const upd = await c.leads.update.mutate({ id: lead.id, status: 'contacted', notes: 'hi' });
    expect(upd.status).toBe('contacted');
    expect((await c.leads.list.query({ minRoofAge: 40 })).length).toBe(0);
    expect(await c.leads.delete.mutate({ id: lead.id })).toEqual({ ok: true });
    await expect(c.leads.delete.mutate({ id: lead.id })).rejects.toThrow();
  });
  it('leads require workspace header', async () => {
    await expect(client().leads.list.query()).rejects.toThrow(/x-workspace-id/);
  });
  it('agent.ask answers offline with citations', async () => {
    const a = await c.agent.ask.mutate({
      question: 'open roofing permits older than 5 years within 3 miles of Oak Park',
    });
    expect(a.mode).toBe('offline');
    expect(a.citations.length).toBeGreaterThan(0);
  });
  it('meta.datasetInfo exposes provenance and counts', async () => {
    const m = await c.meta.datasetInfo.query();
    expect(m.runId).toMatch(/fixture/);
    expect(m.counts.property).toBe(300);
    expect(m.agentMode).toBe('offline');
    expect(m.client).toBe('fixture');
  });
});
