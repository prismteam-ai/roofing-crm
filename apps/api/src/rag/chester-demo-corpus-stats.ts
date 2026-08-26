/**
 * Aggregates Chester-demo corpus statistics for activation validation.
 */
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import {
  CHESTER_DEMO_RAG_COUNTY,
  CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS,
  CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS,
  CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES,
  CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS,
  CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR,
  CHESTER_DEMO_RAG_PROVENANCE,
  CHESTER_DEMO_RAG_SCHEMA_VERSION,
} from "./chester-demo-rag-contract.js";

export interface ChesterDemoCorpusStats {
  totalDocuments: number;
  propertySummaryCount: number;
  permitChunkCount: number;
  longOpenPermitChunkCount: number;
  uniqueChunkIds: number;
  invalidCountyCount: number;
  invalidProvenanceCount: number;
  invalidSchemaCount: number;
  invalidCoordinateCount: number;
}

export function createChesterDemoCorpusStatsAccumulator(): ChesterDemoCorpusStats & {
  chunkIds: Set<string>;
} {
  return {
    totalDocuments: 0,
    propertySummaryCount: 0,
    permitChunkCount: 0,
    longOpenPermitChunkCount: 0,
    uniqueChunkIds: 0,
    invalidCountyCount: 0,
    invalidProvenanceCount: 0,
    invalidSchemaCount: 0,
    invalidCoordinateCount: 0,
    chunkIds: new Set<string>(),
  };
}

export function recordChesterDemoCorpusChunk(
  accumulator: ReturnType<typeof createChesterDemoCorpusStatsAccumulator>,
  chunk: RoofingOpportunityChunk,
): void {
  accumulator.chunkIds.add(chunk.chunkId);
  accumulator.totalDocuments += 1;
  if (chunk.documentKind === "property_summary") {
    accumulator.propertySummaryCount += 1;
  }
  if (chunk.documentKind === "roofing_permit") {
    accumulator.permitChunkCount += 1;
    if (
      chunk.open_permit_years !== null &&
      chunk.open_permit_years >= CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR
    ) {
      accumulator.longOpenPermitChunkCount += 1;
    }
  }
  if (chunk.county !== CHESTER_DEMO_RAG_COUNTY) {
    accumulator.invalidCountyCount += 1;
  }
  if (chunk.provenance !== CHESTER_DEMO_RAG_PROVENANCE) {
    accumulator.invalidProvenanceCount += 1;
  }
  if (
    (chunk.schema_version ?? CHESTER_DEMO_RAG_SCHEMA_VERSION) !==
    CHESTER_DEMO_RAG_SCHEMA_VERSION
  ) {
    accumulator.invalidSchemaCount += 1;
  }
  if (!Number.isFinite(chunk.latitude) || !Number.isFinite(chunk.longitude)) {
    accumulator.invalidCoordinateCount += 1;
  }
  accumulator.uniqueChunkIds = accumulator.chunkIds.size;
}

export function finalizeChesterDemoCorpusStats(
  accumulator: ReturnType<typeof createChesterDemoCorpusStatsAccumulator>,
): ChesterDemoCorpusStats {
  const { chunkIds: _chunkIds, ...stats } = accumulator;
  return stats;
}

export function summarizeChesterDemoCorpus(
  chunks: RoofingOpportunityChunk[],
): ChesterDemoCorpusStats {
  const chunkIds = new Set<string>();
  let propertySummaryCount = 0;
  let permitChunkCount = 0;
  let longOpenPermitChunkCount = 0;
  let invalidCountyCount = 0;
  let invalidProvenanceCount = 0;
  let invalidSchemaCount = 0;
  let invalidCoordinateCount = 0;

  for (const chunk of chunks) {
    chunkIds.add(chunk.chunkId);
    if (chunk.documentKind === "property_summary") {
      propertySummaryCount += 1;
    }
    if (chunk.documentKind === "roofing_permit") {
      permitChunkCount += 1;
      if (
        chunk.open_permit_years !== null &&
        chunk.open_permit_years >= CHESTER_DEMO_RAG_MIN_OPEN_PERMIT_YEARS_FLOOR
      ) {
        longOpenPermitChunkCount += 1;
      }
    }
    if (chunk.county !== CHESTER_DEMO_RAG_COUNTY) {
      invalidCountyCount += 1;
    }
    if (chunk.provenance !== CHESTER_DEMO_RAG_PROVENANCE) {
      invalidProvenanceCount += 1;
    }
    if (
      (chunk.schema_version ?? CHESTER_DEMO_RAG_SCHEMA_VERSION) !==
      CHESTER_DEMO_RAG_SCHEMA_VERSION
    ) {
      invalidSchemaCount += 1;
    }
    if (!Number.isFinite(chunk.latitude) || !Number.isFinite(chunk.longitude)) {
      invalidCoordinateCount += 1;
    }
  }

  return {
    totalDocuments: chunks.length,
    propertySummaryCount,
    permitChunkCount,
    longOpenPermitChunkCount,
    uniqueChunkIds: chunkIds.size,
    invalidCountyCount,
    invalidProvenanceCount,
    invalidSchemaCount,
    invalidCoordinateCount,
  };
}

export function validateChesterDemoCorpusStats(
  stats: ChesterDemoCorpusStats,
): string[] {
  const errors: string[] = [];
  if (stats.totalDocuments !== CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS) {
    errors.push(
      `expected ${String(CHESTER_DEMO_RAG_EXPECTED_TOTAL_DOCUMENTS)} documents, got ${String(stats.totalDocuments)}`,
    );
  }
  if (stats.propertySummaryCount !== CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES) {
    errors.push(
      `expected ${String(CHESTER_DEMO_RAG_EXPECTED_PROPERTY_SUMMARIES)} property summaries, got ${String(stats.propertySummaryCount)}`,
    );
  }
  if (stats.permitChunkCount !== CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS) {
    errors.push(
      `expected ${String(CHESTER_DEMO_RAG_EXPECTED_PERMIT_CHUNKS)} permit chunks, got ${String(stats.permitChunkCount)}`,
    );
  }
  if (
    stats.longOpenPermitChunkCount !== CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS
  ) {
    errors.push(
      `expected ${String(CHESTER_DEMO_RAG_EXPECTED_LONG_OPEN_PERMIT_CHUNKS)} long-open permit chunks, got ${String(stats.longOpenPermitChunkCount)}`,
    );
  }
  if (stats.uniqueChunkIds !== stats.totalDocuments) {
    errors.push("duplicate chunkId values detected");
  }
  if (stats.invalidCountyCount > 0) {
    errors.push(
      `found ${String(stats.invalidCountyCount)} non-chester-demo county rows`,
    );
  }
  if (stats.invalidProvenanceCount > 0) {
    errors.push(
      `found ${String(stats.invalidProvenanceCount)} rows without synthetic_demo provenance`,
    );
  }
  if (stats.invalidSchemaCount > 0) {
    errors.push(
      `found ${String(stats.invalidSchemaCount)} rows with invalid schema_version`,
    );
  }
  if (stats.invalidCoordinateCount > 0) {
    errors.push(
      `found ${String(stats.invalidCoordinateCount)} rows with invalid coordinates`,
    );
  }
  return errors;
}

export function validateChesterDemoFixtureStats(
  stats: ChesterDemoCorpusStats,
): string[] {
  const errors: string[] = [];
  if (stats.uniqueChunkIds !== stats.totalDocuments) {
    errors.push("duplicate chunkId values detected");
  }
  if (stats.invalidCountyCount > 0) {
    errors.push(
      `found ${String(stats.invalidCountyCount)} non-chester-demo county rows`,
    );
  }
  if (stats.invalidProvenanceCount > 0) {
    errors.push(
      `found ${String(stats.invalidProvenanceCount)} rows without synthetic_demo provenance`,
    );
  }
  return errors;
}
