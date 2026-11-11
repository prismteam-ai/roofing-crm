import { describe, expect, it } from 'vitest';
import { FakeEmbeddingService } from './embedding.js';
import {
  InMemoryCorpusStore,
  InMemoryRetrievalIndex,
  cosine,
  matchesFilter,
} from './index-memory.js';
import type { CorpusDoc } from './types.js';

const doc = (id: string, text: string, m: Partial<CorpusDoc['metadata']> = {}): CorpusDoc => ({
  id,
  kind: id.startsWith('permit') ? 'permit' : 'property',
  text,
  metadata: {
    pin14: null,
    permitId: null,
    sourceUrl: null,
    lat: 0,
    lon: 0,
    roofAgeYears: null,
    openRoofingPermit: false,
    openDays: null,
    contractorName: null,
    bbbRating: null,
    ...m,
  },
});

describe('cosine', () => {
  it('handles identical, orthogonal and empty vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([], [])).toBe(0);
  });
});

describe('FakeEmbeddingService', () => {
  it('is deterministic and unit-norm', async () => {
    const e = new FakeEmbeddingService();
    const [a, b] = await e.embed(['open roofing permit', 'open roofing permit']);
    expect(a).toEqual(b);
    expect(Math.hypot(...(a ?? []))).toBeCloseTo(1);
  });
  it('ranks lexically similar text higher', async () => {
    const e = new FakeEmbeddingService();
    const [q, near, far] = await e.embed([
      'roof shingle tear off',
      'tear off and replace shingle roof',
      'kitchen remodel plumbing',
    ]);
    expect(cosine(q!, near!)).toBeGreaterThan(cosine(q!, far!));
  });
});

describe('matchesFilter', () => {
  it('applies roof age, open-permit and open-days filters', () => {
    const old = doc('property:1', 'x', { roofAgeYears: 30 });
    const young = doc('property:2', 'x', { roofAgeYears: 5 });
    const open = doc('permit:3', 'x', { openRoofingPermit: true, openDays: 2000 });
    expect(matchesFilter(old, { minRoofAge: 15 })).toBe(true);
    expect(matchesFilter(young, { minRoofAge: 15 })).toBe(false);
    expect(matchesFilter(young, { openRoofingOnly: true })).toBe(false);
    expect(matchesFilter(open, { openRoofingOnly: true, minOpenDays: 1825 })).toBe(true);
    expect(matchesFilter(open, { minOpenDays: 3000 })).toBe(false);
    expect(matchesFilter(open, { kinds: ['property'] })).toBe(false);
    expect(matchesFilter(open, undefined)).toBe(true);
  });
});

describe('InMemoryRetrievalIndex', () => {
  it('filters first then ranks by similarity', async () => {
    const idx = new InMemoryRetrievalIndex(new FakeEmbeddingService());
    await idx.index([
      doc('permit:a', 'roofing permit open shingle tear off', {
        openRoofingPermit: true,
        openDays: 3000,
      }),
      doc('permit:b', 'roofing permit closed shingle tear off', {
        openRoofingPermit: false,
        openDays: null,
      }),
      doc('property:c', 'property kitchen remodel', { roofAgeYears: 40 }),
    ]);
    expect(idx.size()).toBe(3);
    const hits = await idx.search('shingle tear off roofing', {
      k: 5,
      filter: { openRoofingOnly: true },
    });
    expect(hits.map((h) => h.doc.id)).toEqual(['permit:a']);
    const all = await idx.search('shingle tear off roofing', { k: 2 });
    expect(all.map((h) => h.doc.id).sort()).toEqual(['permit:a', 'permit:b']);
  });
  it('does not re-embed already indexed docs', async () => {
    let calls = 0;
    const embedder = {
      model: 'spy',
      embed: async (t: string[]) => {
        calls += t.length;
        return t.map(() => [1]);
      },
    };
    const idx = new InMemoryRetrievalIndex(embedder);
    await idx.index([doc('property:1', 'a')]);
    await idx.index([doc('property:1', 'a'), doc('property:2', 'b')]);
    expect(calls).toBe(2);
  });
  it('returns nothing on empty index', async () => {
    const idx = new InMemoryRetrievalIndex(new FakeEmbeddingService());
    expect(await idx.search('x', { k: 3 })).toEqual([]);
  });
});

describe('InMemoryCorpusStore', () => {
  it('upserts and reads back', async () => {
    const s = new InMemoryCorpusStore();
    await s.upsert([doc('property:1', 'a'), doc('property:1', 'b')]);
    expect((await s.all()).length).toBe(1);
    expect((await s.get('property:1'))?.text).toBe('b');
  });
});
