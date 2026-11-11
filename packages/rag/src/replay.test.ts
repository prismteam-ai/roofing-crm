import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeEmbeddingService } from './embedding.js';
import { InMemoryRetrievalIndex } from './index-memory.js';
import { corpusDocSchema, retrievalFilterSchema } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/rag');
const querySchema = z.object({
  id: z.string(),
  question: z.string(),
  filter: retrievalFilterSchema.optional(),
  k: z.number().int().default(5),
  expect: z.object({
    minHits: z.number().int().default(1),
    allOpenRoofing: z.boolean().optional(),
    minOpenDays: z.number().optional(),
    minRoofAge: z.number().optional(),
    kinds: z.array(z.enum(['property', 'permit'])).optional(),
    mustIncludeId: z.string().optional(),
  }),
});

const corpus = readdirSync(join(root, 'corpus'))
  .filter((f) => f.endsWith('.jsonl'))
  .flatMap((f) =>
    readFileSync(join(root, 'corpus', f), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => corpusDocSchema.parse(JSON.parse(l))),
  );
const queries = readdirSync(join(root, 'queries'))
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) =>
    z.array(querySchema).parse(JSON.parse(readFileSync(join(root, 'queries', f), 'utf8'))),
  );

describe('RAG replay (fake embeddings, no network)', () => {
  const index = new InMemoryRetrievalIndex(new FakeEmbeddingService());
  it('loads the committed corpus', async () => {
    expect(corpus.length).toBeGreaterThan(50);
    await index.index(corpus);
    expect(index.size()).toBe(corpus.length);
  });
  for (const q of queries) {
    it(`replays ${q.id}: ${q.question}`, async () => {
      const hits = await index.search(q.question, { k: q.k, filter: q.filter });
      expect(hits.length).toBeGreaterThanOrEqual(q.expect.minHits);
      for (const h of hits) {
        if (q.expect.allOpenRoofing) expect(h.doc.metadata.openRoofingPermit).toBe(true);
        if (q.expect.minOpenDays !== undefined)
          expect(h.doc.metadata.openDays ?? 0).toBeGreaterThanOrEqual(q.expect.minOpenDays);
        if (q.expect.minRoofAge !== undefined && !h.doc.metadata.openRoofingPermit)
          expect(h.doc.metadata.roofAgeYears ?? 0).toBeGreaterThanOrEqual(q.expect.minRoofAge);
        if (q.expect.kinds) expect(q.expect.kinds).toContain(h.doc.kind);
        expect(h.doc.metadata.pin14).toMatch(/^\d{14}$/);
      }
      if (q.expect.mustIncludeId)
        expect(hits.map((h) => h.doc.id)).toContain(q.expect.mustIncludeId);
      // scores are sorted descending
      for (let i = 1; i < hits.length; i++)
        expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    });
  }
});
