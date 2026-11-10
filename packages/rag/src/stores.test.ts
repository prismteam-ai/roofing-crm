import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryTraceSink, JsonlReviewStore, JsonlTraceSink } from './stores.js';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('JsonlTraceSink', () => {
  it('appends one JSON line per event, per day file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'trace-'));
    const sink = new JsonlTraceSink(dir);
    await sink.write({
      traceId: 't1',
      at: '2026-11-01T10:00:00Z',
      stage: 'question',
      data: { q: 'x' },
    });
    await sink.write({ traceId: 't1', at: '2026-11-01T10:00:01Z', stage: 'answer', data: {} });
    const lines = (await readFile(join(dir, '2026-11-01.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ traceId: 't1', stage: 'question' });
  });
});

describe('JsonlReviewStore', () => {
  it('round-trips reviews and validates', async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-'));
    const store = new JsonlReviewStore(join(dir, 'reviews.jsonl'));
    expect(await store.list()).toEqual([]);
    await store.add({
      traceId: 't1',
      verdict: 'good',
      comment: '',
      createdAt: '2026-11-01T00:00:00Z',
    });
    expect(await store.list()).toHaveLength(1);
  });
});

describe('InMemoryTraceSink', () => {
  it('collects events', async () => {
    const s = new InMemoryTraceSink();
    await s.write({ traceId: 't', at: 'now', stage: 'error', data: {} });
    expect(s.events).toHaveLength(1);
  });
});
