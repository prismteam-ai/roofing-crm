/**
 * Zod contract for roofing-opportunity RAG corpus documents.
 *
 * Matches fixtures/rag/corpus/*.jsonl and OpenSearch index documents.
 */
import { z } from "zod";

export const roofingOpportunityDocumentKindSchema = z.enum([
  "property_summary",
  "roofing_permit",
]);

export const roofingOpportunityChunkSchema = z.object({
  chunkId: z.string().min(1),
  propertyId: z.string().min(1),
  parcel_identifier: z.string().nullable().optional(),
  county: z.string().min(1),
  documentKind: roofingOpportunityDocumentKindSchema,
  text: z.string().min(1),
  sourceUri: z.string().min(1),
  built_year: z.number().int().nullable(),
  has_open_roofing_permit: z.boolean(),
  open_permit_years: z.number().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  schema_version: z.number().int().positive().optional(),
  source_hash: z.string().min(1).optional(),
  indexed_at: z.string().min(1).optional(),
  permit_id: z.string().nullable().optional(),
  contractor_name: z.string().nullable().optional(),
  bbb_rating: z.string().nullable().optional(),
  address_street: z.string().nullable().optional(),
  address_city: z.string().nullable().optional(),
  provenance: z.string().min(1).optional(),
});

export type RoofingOpportunityChunk = z.infer<typeof roofingOpportunityChunkSchema>;

/**
 * Parses one JSONL line into a validated chunk.
 */
export function parseRoofingOpportunityChunkLine(
  line: string,
): RoofingOpportunityChunk {
  const parsed: unknown = JSON.parse(line);
  return roofingOpportunityChunkSchema.parse(parsed);
}

/**
 * Parses a JSONL corpus file into validated chunks.
 */
export function parseRoofingOpportunityChunkJsonl(
  jsonl: string,
): RoofingOpportunityChunk[] {
  return jsonl
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseRoofingOpportunityChunkLine);
}
