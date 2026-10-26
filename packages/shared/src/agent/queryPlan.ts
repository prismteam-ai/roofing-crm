// QueryPlan: the one shared plan shape for both search.properties/search.permits and the agent's
// plan step (ADR-06 §4, docs/decisions/0000-agent-architecture.md; data-model.md "QueryPlan
// (existing ADR shape)"). Verbatim from the accepted ADR — do not reshape without updating the
// ADR first. `slotSources` drives the UI's assumption chips (stated vs. defaulted vs.
// inherited-from-the-last-turn); `unsupported` records a constraint the user asked for that this
// contract genuinely cannot answer, never silently dropped (constitution XI, data honesty).
import { z } from "zod";

export const QueryPlan = z.object({
  intent: z.enum([
    "find_properties",
    "find_permits",
    "lookup_permit",
    "lookup_property",
    "coverage",
    "propose_leads",
  ]),
  area: z.object({
    kind: z.enum(["place", "zip", "point", "county"]),
    query: z.string().max(80), // what the user typed
    resolved: z
      .object({
        name: z.string(),
        lat: z.number(),
        lon: z.number(),
        source: z.literal("travis-places@1.0.0"),
        sha256: z.string(),
        match: z.enum(["exact", "alias", "fuzzy", "zip", "user_point"]),
        score: z.number().min(0).max(1),
      })
      .optional(),
    // ADR-06 §4: inclusive 0.5-25 mi, the same bound search.properties/search.permits enforce
    // (FR-001) — a Zod error outside it, never silently clamped.
    radiusMi: z.number().min(0.5).max(25),
  }),
  filters: z.object({
    roofAgeMinYears: z.number().int().min(0).max(100).optional(),
    roofConfidenceMin: z.enum(["low", "medium", "high"]).optional(),
    statusClass: z.array(z.enum(["open", "stalled", "closed"])).optional(),
    openYearsMin: z.number().min(0).max(50).optional(),
    tenureYearsMin: z.number().int().min(0).max(100).optional(),
    kind: z.enum(["residential", "commercial"]).optional(),
    permitNumber: z.string().max(40).optional(),
    // T043 (B-09/US2, G4 "owners outside the area") brought this filter to the tool/service layer
    // (services/search.ts's SearchPropertiesInput.ownerAreaClass) but never back to this shared
    // QueryPlan shape — added here (B-09 agent-hardening /simplify fix) so the plan-call's
    // Zod validation and the deterministic dispatch both see the same enum
    // (services/search.ts's existing `ownerAreaClass` values).
    ownerAreaClass: z.array(z.enum(["in_county", "regional", "out_of_area", "unknown"])).optional(),
  }),
  // Drives the assumption chips: which slots the user stated vs. which were defaulted or carried
  // over from the previous turn's QueryPlan (ADR-06 §6.1's memory/"inherited" follow-up pattern).
  slotSources: z.record(z.enum(["stated", "default", "inherited"])),
  unsupported: z.array(
    z.object({
      constraint: z.string().max(80),
      reason: z.enum(["not_in_export", "no_lexicon_carrier", "out_of_scope", "no_free_text"]),
    }),
  ),
});
export type QueryPlan = z.infer<typeof QueryPlan>;
