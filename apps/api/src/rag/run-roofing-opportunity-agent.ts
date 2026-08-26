/**
 * RoofingOpportunityAgent — hybrid retrieval + tool-backed answers.
 */
import type { SearchInRadiusCandidate } from "../routers/search.js";
import type { AgentAskInput, AgentAskOutput } from "./agent-ask-contract.js";
import { resolveAgentAskMessage } from "./agent-ask-contract.js";
import {
  AGENT_ASK_COUNTY_NOT_MAP_READY_COPY,
  AGENT_ASK_LOW_CONFIDENCE_COPY,
  AGENT_ASK_MISSING_MAP_CONTEXT_COPY,
  AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY,
  AGENT_CHESTER_DEMO_NOT_READY_COPY,
  AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY,
  AGENT_NOT_INDEXED_COVERAGE_NOTE,
  AGENT_REAL_CHESTER_STRUCTURED_ONLY_COPY,
  AGENT_WEST_CHESTER_LEE_INDEX_COPY,
  resolveAgentCoverageNote,
  shouldRefuseChesterGeographyOnLeeIndex,
} from "./agent-coverage-copy.js";
import {
  CHESTER_DEMO_RAG_PROVENANCE,
  CHESTER_DEMO_RAG_SCHEMA_VERSION,
  isChesterDemoRagCounty,
} from "./chester-demo-rag-contract.js";
import {
  buildExtractiveRoofingOpportunityAnswer,
  generateRoofingOpportunityAnswer,
  type GenerateRoofingOpportunityAnswerArguments,
} from "./generate-roofing-opportunity-answer.js";
import {
  hybridRetrieveRoofingChunks,
  isRetrievalConfidenceSufficient,
  resolveRetrievalConfidence,
} from "./hybrid-retrieve-roofing-chunks.js";
import type { EmbeddingService, RetrievalIndex } from "./retrieval-interfaces.js";
import {
  planRoofingOpportunityQuery,
  queryPlanToRetrievalFilters,
} from "./plan-roofing-opportunity-query.js";
import type { RoofingOpportunityChunk } from "./roofing-opportunity-chunk.js";
import type { RagCorpusManifest } from "./rag-corpus-manifest.js";
import { manifestSupportsChesterDemoRag } from "./chester-demo-rag-readiness.js";

export {
  AGENT_ASK_COUNTY_NOT_MAP_READY_COPY,
  AGENT_ASK_LOW_CONFIDENCE_COPY,
  AGENT_ASK_MISSING_MAP_CONTEXT_COPY,
  AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY,
  AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY,
  AGENT_NOT_INDEXED_COVERAGE_NOTE,
  AGENT_WEST_CHESTER_LEE_INDEX_COPY,
  LEE_DEV_FALLBACK_COVERAGE_NOTE,
} from "./agent-coverage-copy.js";

/**
 * Dependencies injected into the roofing opportunity agent.
 */
export interface RoofingOpportunityAgentDependencies {
  retrievalIndex: RetrievalIndex;
  embeddingService: EmbeddingService;
  chunksById: Map<string, RoofingOpportunityChunk>;
  resolveMapSearchReady?: (county: string) => Promise<boolean>;
  resolveFreshness?: () => Promise<AgentAskOutput["freshness"]>;
  resolveCorpusManifest?: () => Promise<RagCorpusManifest | null>;
  resolveChesterDemoRagReady?: (county: string) => Promise<boolean>;
  searchInRadius?: (arguments_: {
    county: string;
    center: { lat: number; lng: number };
    radiusMiles: number;
    minStructureAgeYears?: number;
    limit?: number;
  }) => Promise<SearchInRadiusCandidate[]>;
  propertiesGet?: (arguments_: {
    county: string;
    propertyId: string;
  }) => Promise<{ addressStreet: string | null }>;
  generateAnswer?: (
    arguments_: GenerateRoofingOpportunityAnswerArguments,
  ) => Promise<string>;
}

export function buildAgentAskNotIndexedResponse(
  input: AgentAskInput,
  mapSearchReady = true,
  county = input.county,
): AgentAskOutput {
  void input;
  return {
    answer: mapSearchReady
      ? isChesterDemoRagCounty(county)
        ? AGENT_CHESTER_DEMO_NOT_READY_COPY
        : AGENT_ASK_NOT_INDEXED_USE_RADIUS_COPY
      : AGENT_ASK_COUNTY_NOT_MAP_READY_COPY,
    indexed: false,
    citations: [],
    confidence: 0,
    coverageNote: isChesterDemoRagCounty(county)
      ? resolveAgentCoverageNote(county)
      : AGENT_NOT_INDEXED_COVERAGE_NOTE,
  };
}

export function buildWestChesterLeeIndexRefusalResponse(
  input: AgentAskInput,
): AgentAskOutput {
  void input;
  return {
    answer: AGENT_WEST_CHESTER_LEE_INDEX_COPY,
    indexed: true,
    citations: [],
    confidence: 0,
    coverageNote: resolveAgentCoverageNote("lee"),
  };
}

export function buildRealChesterStructuredOnlyResponse(
  input: AgentAskInput,
): AgentAskOutput {
  void input;
  return {
    answer: AGENT_REAL_CHESTER_STRUCTURED_ONLY_COPY,
    indexed: false,
    citations: [],
    confidence: 0,
    coverageNote: resolveAgentCoverageNote("chester"),
    fallback:
      input.center !== undefined && input.radiusMiles !== undefined
        ? {
            type: "structured_search",
            searchInRadiusInput: {
              county: input.county,
              center: input.center,
              radiusMiles: input.radiusMiles,
            },
          }
        : undefined,
  };
}

function buildCitationReason(chunk: RoofingOpportunityChunk): string {
  if (chunk.documentKind === "roofing_permit") {
    return "Open roofing permit facts published for this street (synthetic demo).";
  }
  if (chunk.built_year !== null) {
    return `Structure built_year ${String(chunk.built_year)} (synthetic demo roof-age proxy).`;
  }
  return "Published property summary for this street (synthetic demo).";
}

function resolveSearchMinStructureAgeYears(
  plan: ReturnType<typeof planRoofingOpportunityQuery>,
): number | undefined {
  if (plan.maxBuiltYear !== undefined) {
    return new Date().getUTCFullYear() - plan.maxBuiltYear;
  }
  return plan.minStructureAgeYears;
}

function buildCitationsFromEvidence(
  retrievedChunks: Array<{ chunk: RoofingOpportunityChunk; score: number }>,
  searchCandidates: SearchInRadiusCandidate[],
  _county: string,
  allowedPropertyIds?: ReadonlySet<string>,
): AgentAskOutput["citations"] {
  const seenPropertyIds = new Set<string>();
  const citations: AgentAskOutput["citations"] = [];
  const parcelIdentifierByPropertyId = new Map<string, string | null>();

  for (const candidate of searchCandidates) {
    parcelIdentifierByPropertyId.set(candidate.propertyId, candidate.parcelIdentifier);
  }

  for (const entry of retrievedChunks) {
    if (
      allowedPropertyIds !== undefined &&
      !allowedPropertyIds.has(entry.chunk.propertyId)
    ) {
      continue;
    }
    if (seenPropertyIds.has(entry.chunk.propertyId)) {
      continue;
    }
    seenPropertyIds.add(entry.chunk.propertyId);
    const parcelIdentifier =
      entry.chunk.parcel_identifier ??
      parcelIdentifierByPropertyId.get(entry.chunk.propertyId) ??
      null;
    citations.push({
      sourceUri: entry.chunk.sourceUri,
      propertyId: entry.chunk.propertyId,
      ...(parcelIdentifier !== null ? { parcelIdentifier } : {}),
      reason: buildCitationReason(entry.chunk),
      latitude: entry.chunk.latitude,
      longitude: entry.chunk.longitude,
      addressStreet: entry.chunk.address_street ?? null,
      addressCity: entry.chunk.address_city ?? null,
      builtYear: entry.chunk.built_year ?? null,
    });
    if (citations.length >= 5) {
      return citations;
    }
  }

  return citations;
}

function applyChesterDemoRetrievalFilters(
  filters: ReturnType<typeof queryPlanToRetrievalFilters>,
  queryPlan: ReturnType<typeof planRoofingOpportunityQuery>,
  county: string,
) {
  if (!isChesterDemoRagCounty(county)) {
    return filters;
  }
  return {
    ...filters,
    provenance: CHESTER_DEMO_RAG_PROVENANCE,
    schemaVersion: CHESTER_DEMO_RAG_SCHEMA_VERSION,
    ...(queryPlan.intent === "open_permits"
      ? { documentKind: "roofing_permit" as const }
      : {}),
  };
}

function resolveEvidenceConfidence(
  retrievedChunks: Array<{ chunk: RoofingOpportunityChunk; score: number }>,
  queryPlan: ReturnType<typeof planRoofingOpportunityQuery>,
): number {
  if (queryPlan.propertyIdAlias !== null && retrievedChunks.length > 0) {
    return 1;
  }
  if (retrievedChunks.length > 0) {
    if (
      queryPlan.intent === "open_permits" ||
      queryPlan.intent === "aging_roofs" ||
      queryPlan.requiresRadiusSearch
    ) {
      return 0.9;
    }
    const lexicalConfidence = resolveRetrievalConfidence(retrievedChunks);
    return lexicalConfidence > 0 ? 0.6 : 0;
  }
  return 0;
}

export async function runRoofingOpportunityAgent(
  input: AgentAskInput,
  dependencies: RoofingOpportunityAgentDependencies,
): Promise<AgentAskOutput> {
  const message = resolveAgentAskMessage(input);
  const queryPlan = planRoofingOpportunityQuery({
    message,
    center: input.center,
    radiusMiles: input.radiusMiles,
  });

  const freshness =
    dependencies.resolveFreshness === undefined
      ? undefined
      : await dependencies.resolveFreshness();

  const mapSearchReady =
    dependencies.resolveMapSearchReady === undefined
      ? true
      : await dependencies.resolveMapSearchReady(input.county);
  if (!mapSearchReady) {
    return buildAgentAskNotIndexedResponse(input, false, input.county);
  }

  if (input.county.trim().toLowerCase() === "chester") {
    return buildRealChesterStructuredOnlyResponse(input);
  }

  const manifest =
    dependencies.resolveCorpusManifest === undefined
      ? null
      : await dependencies.resolveCorpusManifest();
  let chesterDemoReady = false;
  if (isChesterDemoRagCounty(input.county)) {
    if (dependencies.resolveChesterDemoRagReady !== undefined) {
      chesterDemoReady = await dependencies.resolveChesterDemoRagReady(input.county);
    } else if (manifestSupportsChesterDemoRag(manifest)) {
      chesterDemoReady = true;
    } else if (
      manifest === null &&
      dependencies.chunksById.size > 0 &&
      [...dependencies.chunksById.values()].some(
        (chunk) => chunk.county === "chester-demo",
      )
    ) {
      chesterDemoReady = true;
    }
  }

  const indexed = isChesterDemoRagCounty(input.county)
    ? chesterDemoReady
    : await dependencies.retrievalIndex.isIndexed();

  if (!indexed) {
    return buildAgentAskNotIndexedResponse(input, mapSearchReady, input.county);
  }

  if (
    shouldRefuseChesterGeographyOnLeeIndex(
      input.county,
      queryPlan.mentionsChesterGeography,
    )
  ) {
    return buildWestChesterLeeIndexRefusalResponse(input);
  }

  if (queryPlan.missingMapContext) {
    return {
      answer: AGENT_ASK_MISSING_MAP_CONTEXT_COPY,
      indexed: true,
      citations: [],
      confidence: 0,
      coverageNote: resolveAgentCoverageNote(input.county),
      freshness,
    };
  }

  let searchCandidates: SearchInRadiusCandidate[] = [];

  if (
    queryPlan.requiresRadiusSearch &&
    dependencies.searchInRadius !== undefined &&
    input.center !== undefined &&
    input.radiusMiles !== undefined
  ) {
    searchCandidates = await dependencies.searchInRadius({
      county: input.county,
      center: input.center,
      radiusMiles: input.radiusMiles,
      minStructureAgeYears: resolveSearchMinStructureAgeYears(queryPlan),
      limit: 25,
    });
  }

  const filters = applyChesterDemoRetrievalFilters(
    queryPlanToRetrievalFilters(queryPlan, {
      county: input.county,
      center: input.center,
      radiusMiles: input.radiusMiles,
    }),
    queryPlan,
    input.county,
  );

  if (
    queryPlan.requiresRadiusSearch &&
    searchCandidates.length === 0 &&
    !isChesterDemoRagCounty(input.county)
  ) {
    return {
      answer:
        "No published properties in this radius match those constraints. Try widening the radius or adjusting filters on the map.",
      indexed: true,
      citations: [],
      confidence: 0,
      coverageNote: resolveAgentCoverageNote(input.county),
      freshness,
      fallback:
        input.center !== undefined && input.radiusMiles !== undefined
          ? {
              type: "structured_search",
              searchInRadiusInput: {
                county: input.county,
                center: input.center,
                radiusMiles: input.radiusMiles,
                minStructureAgeYears: resolveSearchMinStructureAgeYears(queryPlan),
                minOpenPermitYears: queryPlan.minOpenPermitYears,
              },
            }
          : undefined,
    };
  }

  let retrievedChunks = await hybridRetrieveRoofingChunks({
    question: queryPlan.semanticQuery,
    filters,
    embeddingService: dependencies.embeddingService,
    retrievalIndex: dependencies.retrievalIndex,
    chunksById: dependencies.chunksById,
  });

  const hasPermitConstraints =
    queryPlan.hasOpenRoofingPermit === true ||
    queryPlan.minOpenPermitYears !== undefined;
  let noOpenPermitsPublished = false;

  if (
    retrievedChunks.length === 0 &&
    hasPermitConstraints &&
    !isChesterDemoRagCounty(input.county)
  ) {
    const {
      hasOpenRoofingPermit: _droppedHasOpenPermit,
      minOpenPermitYears: _droppedMinOpenPermitYears,
      ...permitFreeFilters
    } = filters;
    const permitFreeChunks = await hybridRetrieveRoofingChunks({
      question: queryPlan.semanticQuery,
      filters: permitFreeFilters,
      embeddingService: dependencies.embeddingService,
      retrievalIndex: dependencies.retrievalIndex,
      chunksById: dependencies.chunksById,
    });
    if (permitFreeChunks.length > 0) {
      retrievedChunks = permitFreeChunks;
      noOpenPermitsPublished = true;
    }
  }

  const confidence = resolveEvidenceConfidence(retrievedChunks, queryPlan);

  const citations = buildCitationsFromEvidence(
    retrievedChunks,
    searchCandidates,
    input.county,
  );

  if (!isRetrievalConfidenceSufficient(confidence)) {
    return {
      answer: AGENT_ASK_LOW_CONFIDENCE_COPY,
      indexed: true,
      citations,
      confidence,
      coverageNote: resolveAgentCoverageNote(input.county),
      freshness,
      fallback:
        input.center !== undefined && input.radiusMiles !== undefined
          ? {
              type: "structured_search",
              searchInRadiusInput: {
                county: input.county,
                center: input.center,
                radiusMiles: input.radiusMiles,
                minStructureAgeYears: resolveSearchMinStructureAgeYears(queryPlan),
                minOpenPermitYears: queryPlan.minOpenPermitYears,
              },
            }
          : undefined,
    };
  }

  if (noOpenPermitsPublished) {
    const answerLines = [AGENT_NO_OPEN_PERMITS_IN_RADIUS_COPY];
    for (const entry of retrievedChunks.slice(0, 3)) {
      answerLines.push(`- ${entry.chunk.text}`);
    }
    return {
      answer: answerLines.join("\n"),
      indexed: true,
      citations,
      confidence,
      coverageNote: resolveAgentCoverageNote(input.county),
      freshness,
    };
  }

  const generateAnswer =
    dependencies.generateAnswer ?? generateRoofingOpportunityAnswer;
  const answer = await generateAnswer({
    message: queryPlan.semanticQuery,
    retrievedChunks,
    searchCandidates,
    county: input.county,
    center: input.center,
    radiusMiles: input.radiusMiles,
  });

  return {
    answer,
    indexed: true,
    citations,
    confidence,
    coverageNote: resolveAgentCoverageNote(input.county),
    freshness,
  };
}

export { buildExtractiveRoofingOpportunityAnswer };
