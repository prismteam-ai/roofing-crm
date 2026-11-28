import { LatLon } from "@crm/shared";
import { z } from "zod";

export const AgentContext = z.object({
  center: LatLon.optional(),
  placeName: z.string().optional(),
  radiusMiles: z.number().optional(),
});
export type AgentContext = z.infer<typeof AgentContext>;

export const ChatTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(20_000),
  /** Returned on assistant turns and sent back, so follow-ups can reuse the previous area. */
  context: AgentContext.optional(),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

export const AgentRequest = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(ChatTurn).max(40).default([]),
  /** The CRM map's search center and radius: the fallback area for an unknown place. */
  mapContext: z.object({ center: LatLon, radiusMiles: z.number().positive().max(50) }).optional(),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

export const AgentStep = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  rowCount: z.number().int(),
  sample: z.array(z.string()),
  error: z.string().optional(),
});

export const AgentAnswer = z.object({
  text: z.string(),
  results: z.array(z.object({ propertyId: z.string(), lat: z.number(), lon: z.number(), label: z.string() })),
  citations: z.array(
    z.object({ propertyId: z.string().optional(), permitId: z.string().optional(), sourceUrl: z.string() }),
  ),
  assumptions: z.array(z.string()),
  missingData: z.array(z.string()),
  /** From the AI SDK step results (what MCP actually returned), never from model text. */
  steps: z.array(AgentStep),
  context: AgentContext,
  model: z.string(),
  usage: z.object({ totalTokens: z.number().int() }),
});
export type AgentAnswer = z.infer<typeof AgentAnswer>;
