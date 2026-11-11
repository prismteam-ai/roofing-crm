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
  it('only cites individual open roofing permits meeting the requested duration', async () => {
    const property = properties.find((p) => p.permits.some((x) => x.is_roofing))!;
    const permit = property.permits.find((x) => x.is_roofing)!;
    const permits = [1827, 1826, 100, null].map((open_days, i) => ({
      ...permit,
      permit_id: `duration-${i}`,
      status_is_open: true,
      open_days,
    }));
    const r = await retrieveEvidence(
      'open roofing permits older than five years',
      [{ ...property, permits }],
      new FakeEmbeddingService(),
      { openOnly: true, minOpenDays: 1826 },
    );
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.openPermits.map((p) => p.permitId)).toEqual(['duration-0', 'duration-1']);
  });
});
