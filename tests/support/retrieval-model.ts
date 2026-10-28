import type {
  GroundedTransport,
  ModelRequest,
  ModelResponse,
} from "../../packages/agent/src/provider";

export function approvedModelResponse(request: ModelRequest): ModelResponse {
  return {
    finishReason: "tool-calls",
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    content: [
      {
        type: "tool-call",
        toolName: "retrieveProperties",
        toolCallId: "synthetic-retrieval-tool",
        input: structuredClone(request.approved),
      },
    ],
  };
}

export function approvedModel(): GroundedTransport & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    calls,
    converse: async (request) => {
      calls.push(structuredClone(request));
      return approvedModelResponse(request);
    },
  };
}
