/**
 * Wires RoofingOpportunityAgent dependencies for Lambda and local routers.
 */
import type { SearchRouterDependencies } from "../routers/search.js";
import { executeSearchInRadius } from "../routers/search.js";
import type { RoofingOpportunityAgentDependencies } from "./run-roofing-opportunity-agent.js";
import { resolveRagFreshness } from "./resolve-rag-freshness.js";
import { resolveRagRuntime } from "./resolve-rag-runtime.js";

/**
 * Builds agent dependencies with hybrid retrieval and optional search.inRadius tool.
 */
export async function createRoofingOpportunityAgentDependencies(
  searchRouterDependencies?: SearchRouterDependencies,
  options?: {
    resolveMapSearchReady?: (county: string) => Promise<boolean>;
  },
): Promise<RoofingOpportunityAgentDependencies> {
  const ragRuntime = await resolveRagRuntime();

  return {
    retrievalIndex: ragRuntime.retrievalIndex,
    embeddingService: ragRuntime.embeddingService,
    chunksById: ragRuntime.chunksById,
    resolveCorpusManifest: ragRuntime.resolveCorpusManifest,
    resolveChesterDemoRagReady: ragRuntime.resolveChesterDemoRagReady,
    resolveFreshness: resolveRagFreshness,
    resolveMapSearchReady: options?.resolveMapSearchReady,
    searchInRadius:
      searchRouterDependencies === undefined
        ? undefined
        : async (arguments_) =>
            executeSearchInRadius(searchRouterDependencies, {
              county: arguments_.county,
              center: arguments_.center,
              radiusMiles: arguments_.radiusMiles,
              minStructureAgeYears: arguments_.minStructureAgeYears,
              limit: arguments_.limit,
            }),
  };
}
