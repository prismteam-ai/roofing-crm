/**
 * Deterministic pseudo-embeddings for CI/local replay without Bedrock.
 */
export const BEDROCK_EMBEDDING_DIMENSIONS = 1024;

/**
 * Deterministic pseudo-embedding normalized to unit length.
 */
export function hashEmbeddingFromText(
  text: string,
  dimensions: number = BEDROCK_EMBEDDING_DIMENSIONS,
): number[] {
  const embedding = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = index % dimensions;
    embedding[bucket] = (embedding[bucket] ?? 0) + text.charCodeAt(index) / 255;
  }
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return embedding;
  }
  return embedding.map((value) => value / norm);
}
