import { describe, expect, it } from 'vitest';
import { ipfsSourceFor, resolveDataset, tableUrls, type DataSource } from '../src/source.js';
import type { LatestManifest } from '../src/contract.js';

function manifest(overrides: Partial<LatestManifest> = {}): LatestManifest {
  return {
    dataset_version: 'v1',
    run_id: 'r1',
    county: 'BREVARD',
    county_fips: '12009',
    fdor_co_no: 15,
    generated_at: '2026-09-01T00:00:00Z',
    base_url: 'https://pipeline.example/data',
    ipfs: {},
    tables: {
      properties: { path: 'v/1/properties/', files: ['a.parquet', 'b.parquet'], row_count: 10, schema_version: '1' },
    },
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status: ok ? status : 500 });
}

describe('resolveDataset', () => {
  it('uses the pipeline Pages source when it succeeds', async () => {
    const fetchImpl = async () => jsonResponse(manifest());
    const result = await resolveDataset({
      pipelinePagesUrl: 'https://pipeline.example/data',
      localMirrorUrl: '/data',
      fetchImpl,
    });
    expect(result.source.kind).toBe('pipeline-pages');
    expect(result.attempts).toHaveLength(0);
  });

  it('falls back to the local mirror when the pipeline source fails, recording why', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).includes('pipeline.example')) throw new Error('network down');
      return jsonResponse(manifest());
    };
    const result = await resolveDataset({
      pipelinePagesUrl: 'https://pipeline.example/data',
      localMirrorUrl: '/data',
      fetchImpl,
    });
    expect(result.source.kind).toBe('local-mirror');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.kind).toBe('pipeline-pages');
    expect(result.attempts[0]?.error).toContain('network down');
  });

  it('throws with every attempt recorded when no source is reachable', async () => {
    const fetchImpl = async () => jsonResponse({}, false);
    await expect(resolveDataset({
      pipelinePagesUrl: 'https://pipeline.example/data',
      localMirrorUrl: '/data',
      fetchImpl,
    })).rejects.toThrow(/pipeline-pages/);
  });

  it('skips the pipeline candidate entirely when no pipelinePagesUrl is given', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return jsonResponse(manifest()); };
    const result = await resolveDataset({ localMirrorUrl: '/data', fetchImpl });
    expect(result.source.kind).toBe('local-mirror');
    expect(calls).toBe(1);
  });
});

describe('ipfsSourceFor', () => {
  it('returns null when the manifest has no root_cid', () => {
    expect(ipfsSourceFor(manifest({ ipfs: {} }))).toBeNull();
  });

  it('builds a gateway URL from the root_cid when present', () => {
    const source = ipfsSourceFor(manifest({ ipfs: { root_cid: 'bafyABC' } }), 'https://gw.example/ipfs');
    expect(source).toEqual({ kind: 'ipfs', baseUrl: 'https://gw.example/ipfs/bafyABC', label: 'IPFS (immutable CID)' });
  });
});

describe('tableUrls', () => {
  const source: DataSource = { kind: 'pipeline-pages', baseUrl: 'https://pipeline.example/data', label: 'x' };

  it('joins base url, table path, and each file', () => {
    const urls = tableUrls(source, manifest(), 'properties');
    expect(urls).toEqual([
      'https://pipeline.example/data/v/1/properties/a.parquet',
      'https://pipeline.example/data/v/1/properties/b.parquet',
    ]);
  });

  it('throws for a table not present in the manifest', () => {
    expect(() => tableUrls(source, manifest(), 'permits')).toThrow(/permits/);
  });
});
