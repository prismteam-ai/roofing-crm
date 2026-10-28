import { z } from "zod";
import {
  DomainError,
  QuerySchema,
  PlaceReferenceSchema,
  CoordinateSchema,
  type PlaceReference,
} from "../../../contracts/src/index";
export const ConstraintClassification = z.enum([
  "applied",
  "unsupported",
  "ambiguous",
  "conflicting",
  "descriptive",
]);
export const ConstraintField = z.enum([
  "center",
  "placeId",
  "placeIndexDigest",
  "countyScope",
  "radiusMeters",
  "roofMinAgeYears",
  "permitStatus",
  "minOpenDays",
  "ownerRegion",
  "minReportedSaleAgeYears",
  "minOwnershipYears",
  "includeUnknown",
  "minConfidence",
  "requiresContractor",
  "requiresVerifiedLicense",
  "requiresBbbRating",
  "sort",
  "limit",
  "display",
  "safety",
  "expression",
]);
export const ConstraintLedgerEntrySchema = z
  .object({
    rawSpan: z.string().max(2000),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    origin: z.enum(["prompt", "context"]),
    normalizedMeaning: z.string().min(1).max(400),
    classification: ConstraintClassification,
    material: z.boolean(),
    typedField: ConstraintField,
    typedValue: z
      .union([
        z.string().max(400),
        z.number().finite(),
        z.boolean(),
        CoordinateSchema,
      ])
      .optional(),
    reason: z.string().min(1).max(800),
    evidence: z.array(z.string().max(500)).max(12),
  })
  .strict()
  .refine(
    (entry) =>
      entry.end >= entry.start &&
      entry.end <= 2000 &&
      (entry.origin !== "prompt" ||
        entry.rawSpan.length === entry.end - entry.start),
    "Constraint span boundaries must match their raw span",
  );
export type ConstraintLedgerEntry = z.infer<typeof ConstraintLedgerEntrySchema>;
export const IntentPlanSchema = z
  .object({
    version: z.literal("compositional-intent-v1"),
    accepted: z.boolean(),
    query: QuerySchema.optional(),
    ledger: z.array(ConstraintLedgerEntrySchema).max(120),
    placeResolution: PlaceReferenceSchema.optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    const blocked = plan.ledger.some(
      (entry) => entry.material && entry.classification !== "applied",
    );
    if (
      plan.accepted ? !plan.query || blocked : Boolean(plan.query) || !blocked
    )
      context.addIssue({
        code: "custom",
        message:
          "Accepted intent requires a query and no blocked material constraints; rejected intent requires a blocked constraint and no executable query",
      });
  });
export type IntentPlan = z.infer<typeof IntentPlanSchema>;
export type PlaceResolution =
  | { status: "resolved"; place: PlaceReference }
  | { status: "ambiguous"; candidates: PlaceReference[]; reason?: string }
  | { status: "outside-county" | "not-found" | "unavailable"; reason: string };
export interface PlaceResolver {
  indexDigest: string;
  resolve(text: string): PlaceResolution;
  get?(placeId: string): PlaceReference | undefined;
}
export interface IntentOptions {
  placeResolver?: PlaceResolver;
  maxRows?: number;
}
export class IntentRejection extends DomainError {
  readonly intent: IntentPlan;
  constructor(intent: IntentPlan) {
    const blockers = intent.ledger.filter(
      (x) => x.material && x.classification !== "applied",
    );
    super(
      "UNSUPPORTED_TOOL",
      blockers[0]?.reason ??
        "The request contains a constraint that cannot be applied safely.",
    );
    this.intent = intent;
  }
}
