import { z } from 'zod';

/** One retrievable document: a property or permit summary with filterable metadata. */
export const corpusDocSchema = z.object({
  id: z.string(),
  kind: z.enum(['property', 'permit']),
  text: z.string(),
  metadata: z.object({
    pin14: z.string().nullable(),
    permitId: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    lat: z.number(),
    lon: z.number(),
    roofAgeYears: z.number().nullable(),
    openRoofingPermit: z.boolean(),
    openDays: z.number().nullable(),
    contractorName: z.string().nullable(),
    bbbRating: z.string().nullable(),
  }),
});
export type CorpusDoc = z.infer<typeof corpusDocSchema>;

export interface CorpusStore {
  upsert(docs: CorpusDoc[]): Promise<void>;
  all(): Promise<CorpusDoc[]>;
  get(id: string): Promise<CorpusDoc | undefined>;
}

export interface EmbeddingService {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const retrievalFilterSchema = z.object({
  minRoofAge: z.number().optional(),
  openRoofingOnly: z.boolean().optional(),
  minOpenDays: z.number().optional(),
  kinds: z.array(z.enum(['property', 'permit'])).optional(),
});
export type RetrievalFilter = z.infer<typeof retrievalFilterSchema>;

export interface RetrievalHit {
  doc: CorpusDoc;
  score: number;
}

export interface RetrievalIndex {
  index(docs: CorpusDoc[]): Promise<void>;
  /** Hybrid: metadata filter first, then embedding similarity over surviving candidates. */
  search(
    query: string,
    opts: { k: number; filter?: RetrievalFilter; maxCandidates?: number },
  ): Promise<RetrievalHit[]>;
  size(): number;
}

export const reviewSchema = z.object({
  traceId: z.string(),
  verdict: z.enum(['good', 'bad', 'unsure']),
  comment: z.string().default(''),
  createdAt: z.string(),
});
export type Review = z.infer<typeof reviewSchema>;

export interface ReviewStore {
  add(review: Review): Promise<void>;
  list(): Promise<Review[]>;
}

export const traceEventSchema = z.object({
  traceId: z.string(),
  at: z.string(),
  stage: z.enum(['question', 'retrieval', 'tool', 'answer', 'error']),
  data: z.record(z.string(), z.unknown()),
});
export type TraceEvent = z.infer<typeof traceEventSchema>;

export interface TraceSink {
  write(event: TraceEvent): Promise<void>;
}
