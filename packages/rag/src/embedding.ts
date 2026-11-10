import { embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingService } from './types.js';

export class OpenAIEmbeddingService implements EmbeddingService {
  readonly model = 'text-embedding-3-small';
  private readonly provider;
  constructor(apiKey: string) {
    this.provider = createOpenAI({ apiKey });
  }
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({
      model: this.provider.textEmbeddingModel(this.model),
      values: texts,
    });
    return embeddings;
  }
}

/**
 * Deterministic, network-free embedding: hashed bag of word tokens into a fixed
 * dimension. Good enough for replay tests and offline mode; lexical overlap ≈ similarity.
 */
export class FakeEmbeddingService implements EmbeddingService {
  readonly model = 'fake-hash-64';
  constructor(private readonly dim = 64) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dim).fill(0);
      for (const tok of t.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) h = Math.imul(h ^ tok.charCodeAt(i), 16777619);
        const idx = (h >>> 0) % this.dim;
        v[idx] = (v[idx] ?? 0) + ((h >>> 8) & 1 ? 1 : -1);
      }
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  }
}
