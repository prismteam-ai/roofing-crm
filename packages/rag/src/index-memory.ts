import type {
  CorpusDoc,
  CorpusStore,
  EmbeddingService,
  RetrievalFilter,
  RetrievalHit,
  RetrievalIndex,
} from './types.js';

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function matchesFilter(doc: CorpusDoc, f: RetrievalFilter | undefined): boolean {
  if (!f) return true;
  const m = doc.metadata;
  if (f.kinds && !f.kinds.includes(doc.kind)) return false;
  if (f.minRoofAge !== undefined && (m.roofAgeYears ?? -1) < f.minRoofAge && !m.openRoofingPermit)
    return false;
  if (f.openRoofingOnly && !m.openRoofingPermit) return false;
  if (f.minOpenDays !== undefined && (m.openDays ?? -1) < f.minOpenDays) return false;
  return true;
}

export class InMemoryCorpusStore implements CorpusStore {
  private readonly docs = new Map<string, CorpusDoc>();
  async upsert(docs: CorpusDoc[]): Promise<void> {
    for (const d of docs) this.docs.set(d.id, d);
  }
  async all(): Promise<CorpusDoc[]> {
    return [...this.docs.values()];
  }
  async get(id: string): Promise<CorpusDoc | undefined> {
    return this.docs.get(id);
  }
}

/** In-memory cosine index. ponytail: O(n) scan per query, fine for <= few thousand area docs. */
export class InMemoryRetrievalIndex implements RetrievalIndex {
  private readonly docs = new Map<string, CorpusDoc>();
  private readonly vectors = new Map<string, number[]>();
  constructor(private readonly embedder: EmbeddingService) {}

  async index(docs: CorpusDoc[]): Promise<void> {
    const fresh = docs.filter((d) => !this.vectors.has(d.id));
    for (const d of docs) this.docs.set(d.id, d);
    const vecs = await this.embedder.embed(fresh.map((d) => d.text));
    fresh.forEach((d, i) => this.vectors.set(d.id, vecs[i] ?? []));
  }

  size(): number {
    return this.docs.size;
  }

  async search(
    query: string,
    opts: { k: number; filter?: RetrievalFilter; maxCandidates?: number },
  ): Promise<RetrievalHit[]> {
    const candidates = [...this.docs.values()].filter((d) => matchesFilter(d, opts.filter));
    // Hybrid: filter first; rank the strongest structured signal (open days, roof age) to cap the candidate set
    const capped = candidates
      .sort(
        (a, b) =>
          (b.metadata.openDays ?? 0) - (a.metadata.openDays ?? 0) ||
          (b.metadata.roofAgeYears ?? 0) - (a.metadata.roofAgeYears ?? 0),
      )
      .slice(0, opts.maxCandidates ?? 200);
    if (capped.length === 0) return [];
    const [q] = await this.embedder.embed([query]);
    return capped
      .map((doc) => ({ doc, score: cosine(q ?? [], this.vectors.get(doc.id) ?? []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.k);
  }
}
