/**
 * Deterministic query planner for roofing opportunity agent.ask requests.
 *
 * Converts natural language plus map context into typed retrieval and radius
 * constraints. Hard geo/age/permit filters must not depend on the LLM.
 */
import { z } from "zod";

import {
  extractPropertyIdAliasFromQuestion,
  mentionsWestChesterOrChesterCounty,
  normalizeRoofingAgentQuestion,
} from "./normalize-roofing-agent-question.js";

export const roofingOpportunityQueryIntentSchema = z.enum([
  "open_permits",
  "aging_roofs",
  "general_opportunity",
  "property_lookup",
]);

export const roofingOpportunityQueryPlanSchema = z.object({
  intent: roofingOpportunityQueryIntentSchema,
  /** Wording retained for semantic hybrid retrieval. */
  semanticQuery: z.string().min(1),
  /** When true, search.inRadius must run before citations are emitted. */
  requiresRadiusSearch: z.boolean(),
  minStructureAgeYears: z.number().int().positive().optional(),
  /** Structures with built_year strictly before this calendar year. */
  maxBuiltYear: z.number().int().optional(),
  hasOpenRoofingPermit: z.boolean().optional(),
  minOpenPermitYears: z.number().int().positive().optional(),
  /** Structured constraints present but map center/radius missing. */
  missingMapContext: z.boolean(),
  propertyIdAlias: z.string().nullable(),
  mentionsChesterGeography: z.boolean(),
});

export type RoofingOpportunityQueryPlan = z.infer<
  typeof roofingOpportunityQueryPlanSchema
>;

const OPEN_PERMIT_PATTERN =
  /\bopen\b[\s\S]{0,40}\b(roof(ing)?\s+)?permits?\b|\b(roof(ing)?\s+)?permits?\b[\s\S]{0,40}\bopen\b/i;

const _AGING_ROOF_PATTERN =
  /\b(built|structure|structures?)\b[\s\S]{0,30}\b(before|older than|over)\b/i;

const GEO_PATTERN =
  /\b(within|miles?|radius|near|around|of this pin|this area|this radius)\b/i;

function parseMaxBuiltYear(normalized: string): number | undefined {
  const beforeYear = /\bbefore\s+(\d{4})\b/i.exec(normalized);
  if (beforeYear !== null) {
    return Number(beforeYear[1]);
  }
  return undefined;
}

function parseMinStructureAgeYears(normalized: string): number | undefined {
  const olderThanYears = /\bolder than\s+(\d+)\s+years?\b/i.exec(normalized);
  if (olderThanYears !== null) {
    return Number(olderThanYears[1]);
  }

  const overYears = /\bover\s+(\d+)\s+years?\s+old\b/i.exec(normalized);
  if (overYears !== null) {
    return Number(overYears[1]);
  }

  const defaultAging =
    /\b(aging|older|old)\s+roofs?\b/i.test(normalized) ||
    /\broofs?\s+older than\b/i.test(normalized);
  if (defaultAging) {
    return 15;
  }

  return undefined;
}

function parseMinOpenPermitYears(normalized: string): number | undefined {
  if (!OPEN_PERMIT_PATTERN.test(normalized)) {
    return undefined;
  }

  const numericYears = /\b(\d+)\s+years?\b/i.exec(normalized);
  if (numericYears !== null) {
    return Number(numericYears[1]);
  }

  if (/\bfive\s+years?\b/i.test(normalized)) {
    return 5;
  }

  if (/\bopen\b[\s\S]{0,40}\bpermits?\b/i.test(normalized)) {
    return 5;
  }

  return undefined;
}

function resolveIntent(arguments_: {
  normalized: string;
  propertyIdAlias: string | null;
  hasOpenPermitSignal: boolean;
  hasAgingSignal: boolean;
}): z.infer<typeof roofingOpportunityQueryIntentSchema> {
  if (arguments_.propertyIdAlias !== null) {
    return "property_lookup";
  }
  if (arguments_.hasOpenPermitSignal) {
    return "open_permits";
  }
  if (arguments_.hasAgingSignal) {
    return "aging_roofs";
  }
  if (/\b(opportunit|lead|door|knock)\b/i.test(arguments_.normalized)) {
    return "general_opportunity";
  }
  return "general_opportunity";
}

/**
 * Builds a typed query plan from the user message and optional map context.
 */
export function planRoofingOpportunityQuery(input: {
  message: string;
  center?: { lat: number; lng: number };
  radiusMiles?: number;
}): RoofingOpportunityQueryPlan {
  const trimmedMessage = input.message.trim();
  const normalized = normalizeRoofingAgentQuestion(trimmedMessage);
  const propertyIdAlias = extractPropertyIdAliasFromQuestion(trimmedMessage);
  const mentionsChesterGeography = mentionsWestChesterOrChesterCounty(trimmedMessage);

  const maxBuiltYear = parseMaxBuiltYear(normalized);
  const minStructureAgeYears = parseMinStructureAgeYears(normalized);
  const minOpenPermitYears = parseMinOpenPermitYears(normalized);
  const hasOpenPermitSignal =
    OPEN_PERMIT_PATTERN.test(normalized) || minOpenPermitYears !== undefined;
  const hasAgingSignal =
    maxBuiltYear !== undefined || minStructureAgeYears !== undefined;

  const hasStructuredConstraint =
    hasOpenPermitSignal ||
    hasAgingSignal ||
    GEO_PATTERN.test(normalized) ||
    propertyIdAlias !== null;

  const hasMapContext = input.center !== undefined && input.radiusMiles !== undefined;

  const requiresRadiusSearch =
    hasStructuredConstraint &&
    hasMapContext &&
    (hasOpenPermitSignal ||
      hasAgingSignal ||
      GEO_PATTERN.test(normalized) ||
      propertyIdAlias !== null);

  const missingMapContext = hasStructuredConstraint && !hasMapContext;

  const intent = resolveIntent({
    normalized,
    propertyIdAlias,
    hasOpenPermitSignal,
    hasAgingSignal,
  });

  return roofingOpportunityQueryPlanSchema.parse({
    intent,
    semanticQuery: trimmedMessage,
    requiresRadiusSearch,
    minStructureAgeYears: maxBuiltYear !== undefined ? undefined : minStructureAgeYears,
    maxBuiltYear,
    hasOpenRoofingPermit: hasOpenPermitSignal ? true : undefined,
    minOpenPermitYears,
    missingMapContext,
    propertyIdAlias,
    mentionsChesterGeography,
  });
}

/**
 * Maps a query plan into hybrid retrieval metadata filters.
 */
export function queryPlanToRetrievalFilters(
  plan: RoofingOpportunityQueryPlan,
  context: {
    county: string;
    center?: { lat: number; lng: number };
    radiusMiles?: number;
  },
): {
  county: string;
  minBuiltYear?: number;
  maxBuiltYear?: number;
  hasOpenRoofingPermit?: boolean;
  minOpenPermitYears?: number;
  center?: { lat: number; lng: number };
  radiusMiles?: number;
} {
  const currentUtcYear = new Date().getUTCFullYear();
  const minBuiltYear =
    plan.minStructureAgeYears !== undefined
      ? currentUtcYear - plan.minStructureAgeYears
      : undefined;

  return {
    county: context.county,
    minBuiltYear,
    maxBuiltYear: plan.maxBuiltYear,
    hasOpenRoofingPermit: plan.hasOpenRoofingPermit,
    minOpenPermitYears: plan.minOpenPermitYears,
    center: context.center,
    radiusMiles: context.radiusMiles,
  };
}
