/**
 * Roofing opportunity agent router.
 *
 * Exposes `agent.ask` for natural-language opportunity questions backed by
 * hybrid retrieval over published Lee chunks (fixture in-memory or OpenSearch).
 */
import { publicProcedure, router } from "../trpc.js";
import {
  agentAskInputSchema,
  agentAskOutputSchema,
  resolveAgentAskMessage,
  type AgentAskInput,
  type AgentAskOutput,
} from "../rag/agent-ask-contract.js";
import {
  buildAgentAskNotIndexedResponse,
  runRoofingOpportunityAgent,
  type RoofingOpportunityAgentDependencies,
} from "../rag/run-roofing-opportunity-agent.js";

export type { AgentAskInput, AgentAskOutput };
export { buildAgentAskNotIndexedResponse };

/**
 * Dependencies for the agent router.
 */
export interface AgentRouterDependencies {
  runAsk?: (input: AgentAskInput) => Promise<AgentAskOutput>;
  roofingOpportunityAgentDependencies?: RoofingOpportunityAgentDependencies;
}

/**
 * Builds the agent tRPC router over injectable ask handler or RAG dependencies.
 */
export function createAgentRouter(dependencies: AgentRouterDependencies = {}) {
  const runAsk =
    dependencies.runAsk ??
    (dependencies.roofingOpportunityAgentDependencies === undefined
      ? async (input: AgentAskInput) => buildAgentAskNotIndexedResponse(input)
      : async (input: AgentAskInput) =>
          runRoofingOpportunityAgent(
            input,
            dependencies.roofingOpportunityAgentDependencies as RoofingOpportunityAgentDependencies,
          ));

  return router({
    /**
     * Answers a natural-language opportunity question with citations.
     */
    ask: publicProcedure
      .input(agentAskInputSchema)
      .output(agentAskOutputSchema)
      .mutation(async ({ ctx, input }) => {
        ctx.logger.debug("agent.ask", {
          county: input.county,
          messageLength: resolveAgentAskMessage(input).length,
        });
        return runAsk(input);
      }),
  });
}

/** Default stub router when RAG runtime is not injected. */
export const agentRouter = createAgentRouter();
