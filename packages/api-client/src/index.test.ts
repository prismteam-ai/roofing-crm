import { describe, expect, it } from 'vitest';
import { createApiClient, getOrCreateWorkspaceId, WORKSPACE_STORAGE_KEY } from './index.js';

describe('getOrCreateWorkspaceId', () => {
  it('creates once and reuses', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const a = getOrCreateWorkspaceId(storage, () => 'ws-1');
    const b = getOrCreateWorkspaceId(storage, () => 'ws-2');
    expect(a).toBe('ws-1');
    expect(b).toBe('ws-1');
    expect(store.get(WORKSPACE_STORAGE_KEY)).toBe('ws-1');
  });
});

describe('createApiClient', () => {
  it('sends the workspace header to /trpc', async () => {
    let seen: { url: string; header: string | null } | null = null;
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), header: new Headers(init?.headers).get('x-workspace-id') };
      return new Response(JSON.stringify([{ result: { data: { ok: true } } }]), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api', workspaceId: 'ws-9', fetch: fetchFn });
    await client.meta.datasetInfo.query();
    expect(seen!.url).toMatch(/^http:\/\/api\/trpc\/meta\.datasetInfo/);
    expect(seen!.header).toBe('ws-9');
  });
});
