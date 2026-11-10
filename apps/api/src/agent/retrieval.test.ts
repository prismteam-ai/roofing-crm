import { describe, expect, it } from 'vitest';
import { FakeEmbeddingService } from '@roofing/rag';
import { loadFixture } from '../dataset/fixture.js';
import { retrieveEvidence } from './retrieval.js';

describe('retrieveEvidence', () => {
  const { properties } = loadFixture();
  it('returns de-duplicated properties honouring filters', async () => {
    const r = await retrieveEvidence(
      'open roofing permit contractor',
      properties.slice(0, 120),
      new FakeEmbeddingService(),
      { k: 5, openOnly: true },
    );
    expect(r.evidence.length).toBeLessThanOrEqual(5);
    expect(new Set(r.evidence.map((e) => e.pin14)).size).toBe(r.evidence.length);
    expect(r.evidence.every((e) => e.openPermits.length > 0)).toBe(true);
    expect(r.indexed).toBeGreaterThan(120);
  });
  it('handles empty input', async () => {
    const r = await retrieveEvidence('x', [], new FakeEmbeddingService());
    expect(r.evidence).toEqual([]);
  });
});
