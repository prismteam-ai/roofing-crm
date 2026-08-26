/**
 * SAM / direct-invoke handler for RoofingOpportunityAgent golden replay.
 */
import { agentAskInputSchema } from "./agent-ask-contract.js";
import { createRoofingOpportunityAgentDependencies } from "./create-agent-ask-dependencies.js";
import { runRoofingOpportunityAgent } from "./run-roofing-opportunity-agent.js";

let cachedAgentDependencies:
  Awaited<ReturnType<typeof createRoofingOpportunityAgentDependencies>> | undefined;

/**
 * Lambda handler for golden fixture replay (SAM local invoke).
 */
export async function handler(event: unknown): Promise<unknown> {
  const payload =
    event !== null && typeof event === "object" && "input" in event
      ? (event as { input: unknown }).input
      : event;
  const input = agentAskInputSchema.parse({
    county:
      payload !== null && typeof payload === "object" && "countyHint" in payload
        ? String((payload as { countyHint: string }).countyHint)
        : payload !== null && typeof payload === "object" && "county" in payload
          ? String((payload as { county: string }).county)
          : "lee",
    message:
      payload !== null && typeof payload === "object" && "message" in payload
        ? String((payload as { message: string }).message)
        : payload !== null && typeof payload === "object" && "question" in payload
          ? String((payload as { question: string }).question)
          : "",
    center:
      payload !== null && typeof payload === "object" && "center" in payload
        ? (payload as { center: { lat: number; lng: number } }).center
        : undefined,
    radiusMiles:
      payload !== null && typeof payload === "object" && "radiusMiles" in payload
        ? Number((payload as { radiusMiles: number }).radiusMiles)
        : undefined,
  });

  cachedAgentDependencies ??= await createRoofingOpportunityAgentDependencies();

  return runRoofingOpportunityAgent(input, cachedAgentDependencies);
}
