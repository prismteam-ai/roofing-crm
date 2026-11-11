import { afterAll, describe, expect, it, vi } from 'vitest';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { FakeEmbeddingService, InMemoryTraceSink } from '@roofing/rag';
import { AgentAdmission } from './agent/limits.js';
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
  it('accepts 4000 note characters and rejects 4001 without losing saved notes', async () => {
    const c = client('notes-boundary');
    const lead = await c.leads.create.mutate({
      pin14: '12345678901234',
      address: 'x',
      lat: 41.9,
      lon: -87.7,
    });
    const notes = 'x'.repeat(4000);
    await c.leads.update.mutate({ id: lead.id, notes });
    await expect(c.leads.update.mutate({ id: lead.id, notes: `${notes}x` })).rejects.toThrow();
    expect((await c.leads.list.query())[0]!.notes).toBe(notes);
    await c.leads.delete.mutate({ id: lead.id });
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

describe('public agent admission over HTTP', () => {
  const answer = {
    answer: 'test',
    mode: 'offline' as const,
    citations: [],
    assumptions: [],
    missingData: [],
    traceId: 'test',
  };
  const request = (app: ReturnType<typeof createApp>, ip = '203.0.113.1') =>
    app.request('/trpc/agent.ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip,
        'x-real-ip': ip,
        'x-workspace-id': ip,
      },
      body: JSON.stringify({ question: 'any leads?' }),
    });
  const limited = (ask: typeof agent.ask, gate: AgentAdmission) =>
    createApp(
      {
        dataset,
        leads,
        agent: { ...agent, ask },
        geocode: gazetteerGeocoder,
        build: { commit: 'test', builtAt: 'now' },
      },
      { agentAdmission: gate },
    );
  it('returns actionable429 and enforces global budgets despite forged IP/workspace headers', async () => {
    let now = 0;
    const ask = vi.fn(async () => answer);
    const app = limited(
      ask,
      new AgentAdmission({ perMinute: 2, perDay: 3, concurrency: 2 }, () => now),
    );
    expect((await request(app, '1.1.1.1')).status).toBe(200);
    expect((await request(app, '2.2.2.2')).status).toBe(200);
    const denied = await request(app, '3.3.3.3');
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('60');
    expect(await denied.json()).toMatchObject({
      error: { data: { code: 'TOO_MANY_REQUESTS', retryAfterSeconds: 60 } },
    });
    now = 60_000;
    expect((await request(app)).status).toBe(200);
    expect((await request(app)).status).toBe(429);
    expect(ask).toHaveBeenCalledTimes(3);
    expect((await app.request('/health')).status).toBe(200);
  });
  it('rejects excess in-flight work and releases slots after success or failure', async () => {
    let finish!: (value: typeof answer) => void;
    const ask = vi
      .fn<typeof agent.ask>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('provider down'))
      .mockResolvedValue(answer);
    const app = limited(ask, new AgentAdmission({ perMinute: 10, perDay: 10, concurrency: 1 }));
    const pending = request(app);
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    const denied = await request(app);
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('5');
    finish(answer);
    expect((await pending).status).toBe(200);
    expect((await request(app)).status).toBe(500);
    expect((await request(app)).status).toBe(200);
  });
});

it('charges every batched public agent procedure without requiring login', async () => {
  const ask = vi.fn(async () => ({
    answer: 'test',
    mode: 'offline' as const,
    citations: [],
    assumptions: [],
    missingData: [],
    traceId: 'test',
  }));
  const limited = createApp(
    {
      dataset,
      leads,
      agent: { ...agent, ask },
      geocode: gazetteerGeocoder,
      build: { commit: 'test', builtAt: 'now' },
    },
    { agentAdmission: new AgentAdmission({ perMinute: 1, perDay: 5, concurrency: 2 }) },
  );
  const c = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://local/trpc',
        fetch: (url, init) => limited.request(String(url), init as RequestInit),
      }),
    ],
  });
  const outcomes = await Promise.allSettled([
    c.agent.ask.mutate({ question: 'first' }),
    c.agent.ask.mutate({ question: 'second' }),
  ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
  expect(ask).toHaveBeenCalledTimes(1);
});
