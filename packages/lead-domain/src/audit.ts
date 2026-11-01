import { z } from "zod";
import { LeadSchema } from "../../contracts/src/index";

/** CRM persistence owns actor attribution; the shared Oracle/query contract stays unchanged. */
export const AuditedLeadSchema = LeadSchema.extend({
  events: z.array(
    LeadSchema.shape.events.element.extend({
      actorSessionId: z.string().min(1).max(100).optional(),
    }),
  ),
});
export type AuditedLead = z.infer<typeof AuditedLeadSchema>;
/** Trusted application context, never parsed from a client lead payload. */
export interface LeadMutationContext {
  actorSessionId?: string;
}
export function storedLead(input: unknown): AuditedLead {
  const parsed = AuditedLeadSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Invalid persisted lead row", { cause: parsed.error });
  return parsed.data;
}
