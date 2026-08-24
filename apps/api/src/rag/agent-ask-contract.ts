/**
 * Shared agent.ask request and response contract.
 */
import { z } from "zod";

export const AGENT_ASK_MAX_MESSAGE_LENGTH = 2000;
export const AGENT_ASK_MAX_RADIUS_MILES = 50;
export const AGENT_ASK_MAX_CITATIONS = 5;

export const agentAskCenterSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const agentAskInputSchema = z
  .object({
    county: z.string().min(1).max(64),
    message: z.string().max(AGENT_ASK_MAX_MESSAGE_LENGTH).optional(),
    center: agentAskCenterSchema.optional(),
    radiusMiles: z.number().positive().max(AGENT_ASK_MAX_RADIUS_MILES).optional(),
    /** @deprecated Use `message`. Kept for backward-compatible clients. */
    question: z.string().max(AGENT_ASK_MAX_MESSAGE_LENGTH).optional(),
  })
  .superRefine((value, context) => {
    const resolvedMessage =
      (value.message?.trim().length ?? 0) > 0
        ? (value.message?.trim() ?? "")
        : (value.question?.trim() ?? "");
    if (resolvedMessage.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "message or question is required",
        path: ["message"],
      });
    }
  });

export const agentAskCitationSchema = z.object({
  sourceUri: z.string().min(1),
  propertyId: z.string().min(1),
  parcelIdentifier: z.string().nullable().optional(),
  reason: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  addressStreet: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  builtYear: z.number().int().nullable().optional(),
});

export const agentAskFallbackSchema = z.object({
  type: z.literal("structured_search"),
  searchInRadiusInput: z.object({
    county: z.string().min(1),
    center: agentAskCenterSchema,
    radiusMiles: z.number().positive(),
    minStructureAgeYears: z.number().int().positive().optional(),
    minOpenPermitYears: z.number().int().positive().optional(),
  }),
});

export const agentAskFreshnessSchema = z.object({
  indexedAt: z.string().nullable(),
  corpusSource: z.string().min(1),
  documentCount: z.number().int().nonnegative().nullable(),
});

export const agentAskOutputSchema = z.object({
  answer: z.string().min(1),
  indexed: z.boolean(),
  citations: z.array(agentAskCitationSchema).max(AGENT_ASK_MAX_CITATIONS),
  confidence: z.number().min(0).max(1),
  coverageNote: z.string().min(1),
  fallback: agentAskFallbackSchema.optional(),
  freshness: agentAskFreshnessSchema.optional(),
});

export type AgentAskInput = z.infer<typeof agentAskInputSchema>;
export type AgentAskOutput = z.infer<typeof agentAskOutputSchema>;
export type AgentAskCitation = z.infer<typeof agentAskCitationSchema>;
export type AgentAskFreshness = z.infer<typeof agentAskFreshnessSchema>;

/**
 * Normalizes legacy `question` field to `message`.
 */
export function resolveAgentAskMessage(input: AgentAskInput): string {
  const message = input.message?.trim() ?? "";
  if (message.length > 0) {
    return message;
  }
  return input.question?.trim() ?? "";
}
