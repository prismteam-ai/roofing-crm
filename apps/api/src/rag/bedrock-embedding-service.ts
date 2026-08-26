/**
 * Bedrock embedding service via Vercel AI SDK.
 */
import { embed } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import {
  BEDROCK_EMBEDDING_DIMENSIONS,
  hashEmbeddingFromText,
} from "./embedding-hash.js";
import type { EmbeddingService } from "./retrieval-interfaces.js";

export { BEDROCK_EMBEDDING_DIMENSIONS, hashEmbeddingFromText };

const DEFAULT_EMBEDDING_MODEL_ID =
  process.env.RAG_EMBEDDING_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

/**
 * Creates a Bedrock embedding service when AWS credentials and model are available.
 */
export function createBedrockEmbeddingService(): EmbeddingService {
  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? "us-east-2",
  });

  return {
    async embedText(text: string): Promise<number[]> {
      const result = await embed({
        model: bedrock.embedding(DEFAULT_EMBEDDING_MODEL_ID),
        value: text,
      });
      return [...result.embedding];
    },
    async embedTexts(texts: string[]): Promise<number[][]> {
      return Promise.all(texts.map((text) => this.embedText(text)));
    },
  };
}

/**
 * Deterministic embedding for CI and local tests without Bedrock.
 */
export function createHashEmbeddingService(): EmbeddingService {
  return {
    async embedText(text: string): Promise<number[]> {
      return hashEmbeddingFromText(text);
    },
    async embedTexts(texts: string[]): Promise<number[][]> {
      return texts.map((text) => hashEmbeddingFromText(text));
    },
  };
}

/**
 * Resolves embedding service from environment.
 */
export function resolveEmbeddingService(): EmbeddingService {
  if (process.env.RAG_USE_BEDROCK_EMBEDDINGS === "1") {
    return createBedrockEmbeddingService();
  }
  return createHashEmbeddingService();
}
