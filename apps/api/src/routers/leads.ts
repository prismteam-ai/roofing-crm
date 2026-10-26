// B-07 `leads` router (contracts/leads.md). Entry layer only: Zod-parse input, call the injected
// `leadService`, map typed errors to tRPC codes. No business rule inline. Every procedure is
// wrapped in Powertools Logger/Tracer/Metrics (constitution §8/XIII). Logs carry the procedure
// name, request id and outcome only: never addresses, note text, assignee or owner names (P0-13).
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LeadFilters, LeadStatus } from "@crm/shared";
import { createObservability, METRIC_NAMES } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import {
  causeWithCode,
  publicProcedure,
  requireLeadService,
  requireUserId,
  router,
} from "../trpc.js";
import {
  LeadAlreadyExistsError,
  LeadIndexUnavailableError,
  LeadNotFoundError,
  LeadSequenceConflictError,
} from "../leadErrors.js";

const obs = createObservability("crm-api");

const NOTE_MAX_CHARS = 4000; // constitution §6 validation boundary
const LIST_MAX_LIMIT = 100;
const CREATE_MANY_MAX = 25;
const PRESENCE_MAX = 100;

const CreateLeadInput = z.object({
  fips: z.string().min(1),
  requestIdentifier: z.string().min(1),
  address: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  signals: z.object({
    roofAgeYears: z.number().optional(),
    roofAgeBasis: z.string().optional(),
    roofAgeConfidence: z.enum(["high", "medium", "low", "none"]).optional(),
    openPermitId: z.string().optional(),
    openPermitStatus: z.enum(["open", "stalled"]).optional(),
    openDays: z.number().optional(),
    contractor: z.string().optional(),
    bbbRating: z.string().optional(),
    bbbStatus: z.enum(["rated", "not_found", "blocked", "not_checked"]).optional(),
    contractorRecorded: z.boolean().optional(),
  }),
  sourceManifestCid: z.string().min(1),
  createdFrom: z.enum(["map", "list", "agent"]),
});

const LeadKeyInput = z.object({ leadKey: z.string().min(1) });
const SequenceInput = z.object({ expectedSequence: z.number().int().nonnegative().optional() });

const ListInput = z.object({
  filters: LeadFilters.refine(
    (f) => f.radiusMi === undefined || (f.centerLat !== undefined && f.centerLon !== undefined),
    { message: "radiusMi requires centerLat and centerLon" },
  )
    .refine(
      (f) =>
        (f.radiusMi === undefined) === (f.centerLat === undefined) &&
        (f.centerLat === undefined) === (f.centerLon === undefined),
      { message: "radiusMi, centerLat and centerLon must be given together or not at all" },
    )
    .optional(),
  assignee: z.string().min(1).optional(),
  status: LeadStatus.optional(),
  cursor: z.string().max(32).optional(),
  limit: z.number().int().positive().max(LIST_MAX_LIMIT).optional(),
});

/** Typed lead errors -> tRPC errors; anything unrecognised is returned unchanged. */
function toTrpcError(error: unknown): unknown {
  if (error instanceof TRPCError) return error;
  if (error instanceof LeadAlreadyExistsError) {
    return new TRPCError({
      code: "CONFLICT",
      message: "Already a lead",
      cause: causeWithCode("ALREADY_EXISTS", error.message),
    });
  }
  if (error instanceof LeadSequenceConflictError) {
    return new TRPCError({
      code: "CONFLICT",
      message: "This lead changed since you loaded it; reload and retry",
      cause: causeWithCode("STALE_SEQUENCE", error.message),
    });
  }
  if (error instanceof LeadNotFoundError) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message, cause: error });
  }
  if (error instanceof LeadIndexUnavailableError) {
    return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message, cause: error });
  }
  return error;
}

/** Wraps one procedure body with the trace subsegment, a structured log line and a metric. */
async function observed<T>(
  procedure: string,
  requestId: string,
  metric: string,
  body: () => Promise<T>,
): Promise<T> {
  const subsegment = obs.tracer.getSegment()?.addNewSubsegment(`## leads.${procedure}`);
  try {
    const result = await body();
    obs.logger.info("leads procedure ok", { procedure, requestId });
    obs.metrics.addMetric(metric, MetricUnit.Count, 1);
    return result;
  } catch (error) {
    const mapped = toTrpcError(error);
    const code = mapped instanceof TRPCError ? mapped.code : "INTERNAL_SERVER_ERROR";
    // Expected domain outcomes (duplicate, stale, not found) are info; only unexpected is error.
    const unexpected = !(mapped instanceof TRPCError) || code === "INTERNAL_SERVER_ERROR";
    obs.logger[unexpected ? "error" : "info"]("leads procedure failed", {
      procedure,
      requestId,
      code,
    });
    if (unexpected) obs.metrics.addMetric(METRIC_NAMES.LeadsErrors, MetricUnit.Count, 1);
    throw mapped;
  } finally {
    subsegment?.close();
    obs.metrics.publishStoredMetrics();
  }
}

const UndoCreateInput = LeadKeyInput.extend({
  /** Optional guard: refuse unless the lead still carries the leadId `create` returned. */
  leadId: z.string().min(1).optional(),
});
const CreateManyInput = z.object({ items: z.array(CreateLeadInput).min(1).max(CREATE_MANY_MAX) });
const PresenceInput = z.object({
  requestIdentifiers: z.array(z.string().min(1)).min(1).max(PRESENCE_MAX),
  /** County FIPS; defaults to Travis (48453), the one county the CRM serves. */
  fips: z.string().min(1).optional(),
});

export const leadsRouter = router({
  create: publicProcedure
    .input(CreateLeadInput)
    .mutation(({ input, ctx }) =>
      observed("create", ctx.requestId, METRIC_NAMES.LeadsCreated, () =>
        requireLeadService(ctx).create(input, requireUserId(ctx)),
      ),
    ),

  /** Typed refusals come back as `{ deleted: false, reason }`, never as an error: an undo that
   *  does not apply is an outcome the caller shows, not a failure. */
  undoCreate: publicProcedure.input(UndoCreateInput).mutation(async ({ input, ctx }) =>
    observed("undoCreate", ctx.requestId, METRIC_NAMES.LeadsUndone, async () => {
      const res = await requireLeadService(ctx).undoCreate(
        input.leadKey,
        requireUserId(ctx),
        input.leadId,
      );
      return res.deleted
        ? { deleted: true as const }
        : { deleted: false as const, reason: res.reason };
    }),
  ),

  createMany: publicProcedure
    .input(CreateManyInput)
    .mutation(({ input, ctx }) =>
      observed("createMany", ctx.requestId, METRIC_NAMES.LeadsCreated, () =>
        requireLeadService(ctx).createMany(input.items, requireUserId(ctx)),
      ),
    ),

  presence: publicProcedure.input(PresenceInput).query(({ input, ctx }) => {
    requireUserId(ctx);
    return observed("presence", ctx.requestId, METRIC_NAMES.LeadsRead, async () => {
      const rows = await requireLeadService(ctx).presence(input.requestIdentifiers, input.fips);
      return rows.map((r) => ({
        requestIdentifier: r.requestIdentifier,
        leadKey: r.leadKey,
        leadId: r.leadId,
        status: r.status,
      }));
    });
  }),

  updateStatus: publicProcedure
    .input(LeadKeyInput.extend({ status: LeadStatus }).merge(SequenceInput))
    .mutation(({ input, ctx }) =>
      observed("updateStatus", ctx.requestId, METRIC_NAMES.LeadsStatusUpdated, () =>
        requireLeadService(ctx).updateStatus(
          input.leadKey,
          input.status,
          requireUserId(ctx),
          input.expectedSequence,
        ),
      ),
    ),

  /** "Assign to me": the assignee is ALWAYS the caller. There is no rep directory yet, so the
   *  input carries no assignee field; a directory would add one (design G-13) plus a check that the
   *  named person exists. `expectedSequence` is required: the page always has the sequence it
   *  showed. A new lead has sequence 0, so the floor is 0, not 1. */
  assign: publicProcedure
    .input(LeadKeyInput.extend({ expectedSequence: z.number().int().nonnegative() }))
    .mutation(({ input, ctx }) =>
      observed("assign", ctx.requestId, METRIC_NAMES.LeadsAssigned, () => {
        const me = requireUserId(ctx);
        return requireLeadService(ctx).assign(input.leadKey, me, me, input.expectedSequence);
      }),
    ),

  addNote: publicProcedure
    .input(
      LeadKeyInput.extend({ text: z.string().trim().min(1).max(NOTE_MAX_CHARS) }).merge(
        SequenceInput,
      ),
    )
    .mutation(({ input, ctx }) =>
      observed("addNote", ctx.requestId, METRIC_NAMES.LeadsNoteAdded, () =>
        requireLeadService(ctx).addNote(
          input.leadKey,
          input.text,
          requireUserId(ctx),
          input.expectedSequence,
        ),
      ),
    ),

  get: publicProcedure.input(LeadKeyInput).query(({ input, ctx }) =>
    observed("get", ctx.requestId, METRIC_NAMES.LeadsRead, async () => {
      const detail = await requireLeadService(ctx).get(input.leadKey);
      if (detail === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No lead exists for ${input.leadKey}` });
      }
      return detail;
    }),
  ),

  list: publicProcedure
    .input(ListInput)
    .query(({ input, ctx }) =>
      observed("list", ctx.requestId, METRIC_NAMES.LeadsListed, () =>
        requireLeadService(ctx).list(input, requireUserId(ctx)),
      ),
    ),
});
