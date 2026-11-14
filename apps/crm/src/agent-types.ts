/**
 * The hosted agent's request and answer types, declared here (types only) until the API-client tarball carries
 * them. They mirror the pipeline's packages/agent at 6200575: agent.ts (AgentCenter, SessionArea, SessionState,
 * StoppedBy, RefusedBy, AgentUsage, AgentAnswer, AgentRequest), policy.ts (Citation), views place-index.ts
 * (PlaceBasis), and apps/agent-api handler.ts (AnswerResponse: the answer plus `signature`).
 * The one difference: `history` is the Anthropic SDK's MessageParam[] in the agent; the CRM never reads it and
 * sends it back unchanged, so it is typed here as an opaque message list.
 */

/** The search center sent with a question: the CRM's map pin ("map pin", or "my location" after GPS). */
export interface AgentCenter {
  lat: number;
  lon: number;
  label: string;
}

export type PlaceBasis = "jurisdiction" | "postal_city";
export type AreaBasis = PlaceBasis | "request_center" | "coordinates";

export interface SessionArea {
  label: string;
  lat: number;
  lon: number;
  radius_miles: number;
  basis: AreaBasis;
}

export interface SessionState {
  area?: SessionArea;
}

export type StoppedBy =
  | "time_budget"
  | "token_cap"
  | "max_tool_turns"
  | "model_refusal"
  | "max_tokens"
  | "error"
  | "unexpected_stop"
  | "budget";

export type RefusedBy = "people_guard" | "no_tool_call";

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  model_calls: number;
  tool_calls: number;
}

/** A cited record ("contractor": the permit whose contractor rows were shown). */
export interface Citation {
  kind: "parcel" | "permit" | "contractor";
  id: string;
  source_name: string;
  /** Absent when the run states none. */
  license?: string;
  /** Absent when the run states none. */
  attribution?: string;
  collected_at: string;
}

/** One message of the conversation (the agent's Anthropic MessageParam; opaque to the CRM). */
export interface HistoryMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface AgentAnswer {
  status: "answered" | "refused" | "stopped";
  /** Set when status is "refused". */
  refused_by?: RefusedBy;
  stopped_by?: StoppedBy;
  /** The SDK's typed error class name when stopped_by is "error". */
  error?: string;
  text: string;
  /** One or two sentences built from the tool calls (deterministic). */
  reasoning: string;
  assumptions: string[];
  records: Citation[];
  gaps: string[];
  unverified_ids: string[];
  usage: AgentUsage;
  elapsed_ms: number;
  markdown: string;
  /** The conversation to pass to the next call. */
  history: HistoryMessage[];
  session: SessionState;
}

export interface AgentRequest {
  /** 1..2000 characters. */
  question: string;
  center?: AgentCenter;
  history?: HistoryMessage[];
  session?: SessionState;
}

/** The body of POST /agent/answer: the request plus the signature of the previous answer's {history, session}. */
export type AnswerRequest = AgentRequest & { signature?: string };

/** The answer as POST /agent/answer returns it: the agent's answer and the server's MAC of {history, session}. */
export type AnswerResponse = AgentAnswer & { signature: string };
