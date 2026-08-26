/**
 * HTTP client for agent.ask over the hosted or local tRPC API.
 */
import { fetchTrpcMutation } from "../api/trpc-http";

/**
 * Input for asking the roofing opportunity agent about the current radius.
 */
export interface AgentAskQueryInput {
  county: string;
  message: string;
  center?: { lat: number; lng: number };
  radiusMiles?: number;
}

/**
 * Citation returned by agent.ask.
 */
export interface AgentAskCitation {
  sourceUri: string;
  propertyId: string;
  parcelIdentifier?: string | null;
  reason: string;
  latitude?: number;
  longitude?: number;
  addressStreet?: string | null;
  addressCity?: string | null;
  builtYear?: number | null;
}

/**
 * agent.ask response shape mirrored from the API contract.
 */
export interface AgentAskResult {
  answer: string;
  indexed: boolean;
  citations: AgentAskCitation[];
  confidence: number;
  coverageNote: string;
  fallback?: {
    type: "structured_search";
    searchInRadiusInput: {
      county: string;
      center: { lat: number; lng: number };
      radiusMiles: number;
      minStructureAgeYears?: number;
      minOpenPermitYears?: number;
    };
  };
  freshness?: {
    indexedAt: string | null;
    corpusSource: string;
    documentCount: number | null;
  };
}

/**
 * Client surface the map shell uses for the agent panel.
 */
export interface AgentAskApiClient {
  ask(input: AgentAskQueryInput): Promise<AgentAskResult>;
}

/**
 * Builds an AgentAskApiClient over tRPC HTTP JSON.
 */
export function createHttpAgentAskApiClient(apiBaseUrl: string): AgentAskApiClient {
  return {
    async ask(input: AgentAskQueryInput): Promise<AgentAskResult> {
      return fetchTrpcMutation<AgentAskResult>(apiBaseUrl, "agent.ask", input);
    },
  };
}
