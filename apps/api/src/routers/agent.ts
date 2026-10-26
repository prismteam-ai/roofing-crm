// T035/T036 (B-09, Phase 4/US1), reshaped in the 009-agent-hardening architecture fix: the
// `agent` tRPC router (contracts/agent-api.md). `ask` runs the budget check (step 1, before any
// model call), then delegates the whole two-call, code-driven turn (plan -> scope gate ->
// dispatch -> compose -> verify) to `agent/composeAnswer.ts`'s `runAsk`; `confirmLead` is a
// plain, non-model-invoked mutation that calls the exact same `requireLeadService(ctx).create(...)`
// path `leads.create` already uses — per the confirm-flow-bypass guard (T029), nothing in
// `services/agent/tools.ts` may ever reach that call; only this one handler does.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gazetteer } from "@crm/oracle-views";
import { createObservability, METRIC_NAMES } from "@crm/observability";
import { MetricUnit } from "@aws-lambda-powertools/metrics";
import {
  contractorSnapshot,
  isLivePermit,
  mainLeadPermit,
  type AgentAnswer,
  type QueryPlan,
} from "@crm/shared";
import {
  causeWithCode,
  mapIndexNotReady,
  publicProcedure,
  requireLeadIndex,
  requireLeadService,
  requireUserId,
  router,
} from "../trpc.js";
import type { LeadIndex } from "../adapters/duckDbParquet.js";
import type { LeadRepo } from "../adapters/leadRepo.js";
import { propertyByTcadId } from "../services/agent/tools.js";
import { createPlaceResolver } from "../services/agent/placeResolver.js";
import { resolveModel } from "../agent/getModel.js";
import { estimateCents } from "../agent/modelPricing.js";
import { RUN_AGENT_MAX_MODEL_CALLS } from "../agent/runAgent.js";
import type { SpendReservation } from "../agent/spendCap.js";
import { requireUsageGuard, type UsageGuard } from "../agent/usageGuard.js";
import { meterModel, meteredCostCents, type UsageMeter } from "../agent/usageMeter.js";
import { OverBudgetError, RateLimitedError } from "../agentErrors.js";
import {
  IndexNotReadyError,
  type PermitResult,
  type PropertyResult,
} from "../adapters/duckDbParquet.js";
import { LeadAlreadyExistsError } from "../leadErrors.js";
import type { CreateLeadInput } from "../services/leads.js";
import { emptyAnswer, emptyPlan, runAsk } from "../agent/composeAnswer.js";

const obs = createObservability("crm-api");

const AskInput = z.object({
  question: z.string().trim().min(1).max(500),
  threadId: z.string().min(1),
});

/** Bound on one `agent.confirmLeads` batch, matching `leads.createMany`. */
const CONFIRM_LEADS_MAX = 25;
/** Concurrent lead writes inside one batch. */
const CONFIRM_LEADS_CONCURRENCY = 3;

const ConfirmLeadsInput = z.object({
  threadId: z.string().min(1),
  tcadIds: z.array(z.string().min(1)).min(1).max(CONFIRM_LEADS_MAX),
});

type ConfirmFailureCode =
  | "NOT_PROPOSED"
  | "NOT_FOUND"
  | "NO_COORDINATES"
  | "INDEX_NOT_READY"
  | "CREATE_FAILED";

const ConfirmLeadInput = z.object({
  threadId: z.string().min(1),
  tcadId: z.string().min(1),
});

/** Outcomes whose `plan` is a real, in-scope reading of the rep's question — the only ones worth
 *  recording as the thread's last plan (follow-up inheritance) or carrying proposals. */
const RECORDABLE_OUTCOMES: ReadonlySet<AgentAnswer["outcome"]> = new Set([
  "answered",
  "empty_in_scope",
  "field_not_published",
]);

/** CR finding 4: the guard fails closed. A deploy without `CRM_AGENT_USAGE_TABLE_NAME` (or with an
 *  unpriced `AGENT_MODEL_ID`) gets a typed `AGENT_GUARD_NOT_CONFIGURED` error and an error log —
 *  never an unmetered model call. */
function guardOrFail(requestId: string): UsageGuard {
  try {
    return requireUsageGuard();
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    obs.logger.error("agent usage guard not configured", { requestId, reason: name });
    const message = "The agent is not configured on this deploy (usage guard unavailable).";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
      cause: causeWithCode("AGENT_GUARD_NOT_CONFIGURED", message),
    });
  }
}

/** contracts/agent-api.md step 1, before any model call. CR finding 3: over either limit the
 *  procedure *returns* a typed `AgentAnswer` (`rate_limited` with `retryAfterSec`, `paused` with
 *  `resetsAt`) — the outcomes the Ask screen keys its throttled/paused states on — instead of
 *  throwing. On success, returns the spend reservation to reconcile after the turn. */
async function checkBudget(
  guard: UsageGuard,
  userId: string,
  question: string,
  traceId: string,
): Promise<{ readonly blocked: AgentAnswer } | { readonly reservation: SpendReservation }> {
  try {
    await guard.rateLimiter.check(userId, "ask");
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return {
        blocked: {
          ...emptyAnswer("rate_limited", emptyPlan(question), traceId, 0),
          retryAfterSec: error.retryAfterSec,
        },
      };
    }
    throw error;
  }
  try {
    const estimate = estimateCents(guard.price, RUN_AGENT_MAX_MODEL_CALLS);
    return { reservation: await guard.spendCap.reserve(userId, estimate) };
  } catch (error) {
    if (error instanceof OverBudgetError) {
      return {
        blocked: {
          ...emptyAnswer("paused", emptyPlan(question), traceId, 0),
          resetsAt: error.resetsAt,
        },
      };
    }
    throw error;
  }
}

/** CR finding 5: replace the up-front reservation with the turn's metered cost (every model call
 *  actually started, at real token prices; a call that never reported usage at the per-call
 *  estimate). A failed reconcile leaves the conservative reservation in place — it can only make
 *  the cap stricter, never looser — and is logged. */
async function reconcileSpend(
  guard: UsageGuard,
  reservation: SpendReservation,
  meter: UsageMeter | undefined,
  requestId: string,
): Promise<void> {
  if (meter === undefined) {
    obs.logger.warn("agent spend not metered; keeping the full reservation", { requestId });
    return;
  }
  const snapshot = meter.snapshot();
  const actualCents = meteredCostCents(guard.price, snapshot);
  try {
    await guard.spendCap.reconcile(reservation, actualCents);
    obs.logger.info("agent spend reconciled", {
      requestId,
      reservedCents: reservation.reservedCents,
      actualCents,
      modelCallsStarted: snapshot.started,
    });
  } catch (error) {
    obs.logger.error("agent spend reconcile failed; reservation kept", {
      requestId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

/** CR finding 6b: record the turn's plan and proposals under `threadId` + the rep, so
 *  `confirmLead` can check a tcadId was really proposed here. If the record can't be written, the
 *  proposals are dropped from the answer (with a `missing` reason) rather than offering a Create
 *  button `confirmLead` would then refuse. */
async function recordThreadTurn(
  guard: UsageGuard,
  threadId: string,
  userId: string,
  answer: AgentAnswer,
  requestId: string,
): Promise<AgentAnswer> {
  if (!RECORDABLE_OUTCOMES.has(answer.outcome)) return answer;
  try {
    await guard.threadStore.recordTurn(threadId, userId, {
      plan: answer.plan,
      proposedTcadIds: (answer.proposals ?? []).map((p) => p.tcadId),
    });
    return answer;
  } catch (error) {
    obs.logger.error("agent thread record failed", {
      requestId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    if (answer.proposals === undefined) return answer;
    const { proposals: _dropped, ...rest } = answer;
    return {
      ...rest,
      missing: [
        ...answer.missing,
        {
          field: "proposals",
          reason:
            "The proposals couldn't be saved to this conversation, so they can't be confirmed. Ask again to get them.",
        },
      ],
    };
  }
}

/** contracts/agent-api.md step 2: the thread's last plan, for follow-up inheritance (ADR-06
 *  §6.3). A read failure only loses the inheritance — the question is still answered on its own. */
async function readLastPlan(
  guard: UsageGuard,
  threadId: string,
  userId: string,
  requestId: string,
): Promise<QueryPlan | undefined> {
  try {
    return await guard.threadStore.lastPlan(threadId, userId);
  } catch (error) {
    obs.logger.warn("agent thread read failed; answering without the previous plan", {
      requestId,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return undefined;
  }
}

function confirmError(code: "FORBIDDEN" | "CONFLICT", appCode: string, message: string): TRPCError {
  return new TRPCError({ code, message, cause: causeWithCode(appCode, message) });
}

function noCoordinatesError(): TRPCError {
  // CR finding 6a: never invent coordinates. The lead schema requires lat/lon and the map path's
  // `leads.create` offers no create at all for a property without them, so the agent path refuses.
  const message = "This property has no published coordinates, so it can't be made a lead.";
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message,
    cause: causeWithCode("NO_COORDINATES", message),
  });
}

/** CR finding 6c: the per-user confirm rate limit (one call per `confirmLead` / `confirmLeads`). */
async function checkConfirmRateLimit(guard: UsageGuard, userId: string): Promise<void> {
  try {
    await guard.rateLimiter.check(userId, "confirm");
  } catch (error) {
    if (error instanceof RateLimitedError) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
        cause: causeWithCode("RATE_LIMITED", error.message),
      });
    }
    throw error;
  }
}

/** The lead title, as the map's `propertyTitle` makes it: the stored street address when the index
 *  has one, else `TCAD {id}` (never an invented address). */
function leadTitle(tcadId: string, property: PropertyResult): string {
  const street = property.unnormalizedAddress?.trim();
  return street === undefined || street === "" ? `TCAD ${tcadId}` : street;
}

/** The lead for a proposed property, built only from the index row (never from client input), or
 *  undefined when the row has no coordinates. */
function leadInputFromProperty(
  tcadId: string,
  property: PropertyResult,
  permits: readonly PermitResult[],
): CreateLeadInput | undefined {
  if (property.latitude === null || property.longitude === null) return undefined;
  // The same rule as the map: the open or stalled permit open longest is the lead's main signal.
  const main = mainLeadPermit(permits);
  return {
    fips: gazetteer.TRAVIS_FIPS,
    requestIdentifier: tcadId,
    // The same title the map gives a lead: the street address, else the TCAD id.
    address: leadTitle(tcadId, property),
    lat: property.latitude,
    lon: property.longitude,
    signals: {
      ...(property.roofAgeYears === null ? {} : { roofAgeYears: property.roofAgeYears }),
      roofAgeBasis: property.roofAgeBasis,
      roofAgeConfidence: property.roofAgeConfidence,
      ...(main?.permitNumber == null ? {} : { openPermitId: main.permitNumber }),
      ...(main?.openDays == null ? {} : { openDays: main.openDays }),
      ...(main !== null && isLivePermit(main)
        ? { openPermitStatus: main.statusClass === "stalled" ? "stalled" : "open" }
        : {}),
      ...contractorSnapshot(main),
    },
    // Constitution B2 / AC-7: the lead records the manifest this property row actually came from,
    // exactly as `leads.create` on the map path does. Never a pinned constant.
    sourceManifestCid: property.sourceManifestCid,
    createdFrom: "agent",
  };
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** `apps/api/src/services/agent/tools.ts`'s `proposeLeads` only ever reads (a `LeadRepo.get` dup
 *  check) — this stub is used only when a request's context hasn't wired a real `LeadRepo` (a
 *  test exercising `agent.ask` without ever calling `proposeLeads`), and itself still never
 *  writes; it just can't answer a dup-check it was never given a backing store for. */
function unavailableLeadRepo(): LeadRepo {
  const unavailable = (): never => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeadRepo not wired into this Lambda's tRPC context",
    });
  };
  return {
    create: unavailable,
    updateStatus: unavailable,
    addNote: unavailable,
    get: unavailable,
  } as unknown as LeadRepo;
}

/** Typed by shape, not by `TrpcContext` itself — same reason as `requireLeadIndex`/
 *  `requireLeadService`: tRPC's resolved context for a `.mutation(({ctx}) => ...)` callback
 *  widens every optional property to an explicit `| undefined` union, which
 *  `exactOptionalPropertyTypes` treats as distinct from `TrpcContext`'s own optional
 *  declaration. */
interface AskContext {
  readonly requestId: string;
  readonly userId: string | undefined;
  readonly leadIndex: LeadIndex | undefined;
  readonly leadRepo: LeadRepo | undefined;
  readonly model: import("ai").LanguageModel | undefined;
}

async function ask(input: z.infer<typeof AskInput>, ctx: AskContext): Promise<AgentAnswer> {
  const userId = requireUserId(ctx);
  const guard = guardOrFail(ctx.requestId);
  // Resolved before the spend reservation: a misconfigured provider/model id throws here, with
  // nothing reserved, so the day's spend never holds a reservation no `finally` would reconcile.
  // Still fail closed (no model call), and the guard check above still runs first.
  const baseModel = ctx.model ?? (await resolveModel());
  const budget = await checkBudget(guard, userId, input.question, ctx.requestId); // step 1
  if ("blocked" in budget) return budget.blocked;

  const meter = typeof baseModel === "string" ? undefined : meterModel(baseModel);
  try {
    const leadIndex: LeadIndex = requireLeadIndex(ctx);
    const leadRepo = ctx.leadRepo ?? unavailableLeadRepo();
    const previousPlan = await readLastPlan(guard, input.threadId, userId, ctx.requestId);
    let answer: AgentAnswer;
    try {
      answer = await runAsk({
        model: meter?.model ?? baseModel,
        leadIndex,
        leadRepo,
        placeResolver: createPlaceResolver(),
        question: input.question,
        traceId: ctx.requestId,
        obs,
        previousPlan,
      });
    } catch (error) {
      // `leadIndex.indexInfo()` (called inside `runAsk`'s dispatch step) keeps its own typed-error
      // mapping (`mapIndexNotReady`) — same `SERVICE_UNAVAILABLE` pattern as `search.ts`/
      // `property.ts` — applied here since `runAsk` itself has no reason to know about tRPC error
      // shapes.
      return mapIndexNotReady(error);
    }
    return await recordThreadTurn(guard, input.threadId, userId, answer, ctx.requestId);
  } finally {
    await reconcileSpend(guard, budget.reservation, meter, ctx.requestId);
  }
}

export const agentRouter = router({
  ask: publicProcedure.input(AskInput).mutation(async ({ input, ctx }) => {
    const subsegment = obs.tracer.getSegment()?.addNewSubsegment("## agent.ask");
    const startedAtMs = Date.now();
    try {
      const answer = await ask(input, ctx);
      // T045 (ADR §6.1: "Log cache read/write tokens"): logged here (not just carried in
      // `trace`) so a deploy without any trace-consuming UI still surfaces cache-hit behaviour in
      // CloudWatch Logs.
      obs.logger.info("agent.ask ok", {
        requestId: ctx.requestId,
        outcome: answer.outcome,
        cacheStrategy: answer.trace.cacheStrategy,
        cacheReadTokens: answer.trace.cacheReadTokens,
        cacheWriteTokens: answer.trace.cacheWriteTokens,
      });
      // `outcome` dimension (contracts/observability.md): same dimension value on both metrics
      // below, cleared again on the publish in `finally` so it never leaks into another request's
      // flush (Powertools `publishStoredMetrics()` clears dimensions as well as metrics).
      obs.metrics.addDimension("outcome", answer.outcome);
      obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, MetricUnit.Count, 1);
      obs.metrics.addMetric(
        METRIC_NAMES.AgentAnswerLatencyMs,
        MetricUnit.Milliseconds,
        Date.now() - startedAtMs,
      );
      obs.metrics.addMetric(
        METRIC_NAMES.AgentModelCallsTotal,
        MetricUnit.Count,
        answer.trace.modelCalls,
      );
      return answer;
    } catch (error) {
      const code = error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR";
      obs.logger[code === "INTERNAL_SERVER_ERROR" ? "error" : "info"]("agent.ask failed", {
        requestId: ctx.requestId,
        code,
      });
      obs.metrics.addDimension("outcome", "error");
      obs.metrics.addMetric(METRIC_NAMES.AgentAsksTotal, MetricUnit.Count, 1);
      obs.metrics.addMetric(
        METRIC_NAMES.AgentAnswerLatencyMs,
        MetricUnit.Milliseconds,
        Date.now() - startedAtMs,
      );
      throw error;
    } finally {
      subsegment?.close();
      obs.metrics.publishStoredMetrics();
    }
  }),

  confirmLead: publicProcedure.input(ConfirmLeadInput).mutation(async ({ input, ctx }) => {
    const userId = requireUserId(ctx);
    const guard = guardOrFail(ctx.requestId);
    await checkConfirmRateLimit(guard, userId);

    // CR finding 6b: only a tcadId the agent actually proposed in this thread, to this rep.
    if (!(await guard.threadStore.wasProposed(input.threadId, userId, input.tcadId))) {
      throw confirmError(
        "FORBIDDEN",
        "NOT_PROPOSED",
        "That property wasn't proposed in this conversation.",
      );
    }

    const leadIndex = requireLeadIndex(ctx);
    const property = await propertyByTcadId(leadIndex, input.tcadId).catch(mapIndexNotReady);
    if (property === undefined) {
      throw new TRPCError({ code: "NOT_FOUND", message: `No property for tcadId ${input.tcadId}` });
    }
    const detail = await leadIndex.getProperty(property.propertyCid).catch(mapIndexNotReady);
    const lead = leadInputFromProperty(input.tcadId, property, detail?.permits ?? []);
    if (lead === undefined) throw noCoordinatesError();
    try {
      return await requireLeadService(ctx).create(lead, userId);
    } catch (error) {
      // A duplicate is a valid outcome (contracts/agent-api.md), mapped exactly as `leads.create`
      // maps it, not a 500.
      if (error instanceof LeadAlreadyExistsError) {
        throw confirmError("CONFLICT", "ALREADY_EXISTS", "Already a lead");
      }
      throw error;
    }
  }),

  /** Ask-in-map: confirm several proposals from one thread (contracts/agent-confirm-leads.md).
   *  Every check of `confirmLead` applies; the rate limit is one `confirm` call per batch. */
  confirmLeads: publicProcedure.input(ConfirmLeadsInput).mutation(async ({ input, ctx }) => {
    const userId = requireUserId(ctx);
    const guard = guardOrFail(ctx.requestId);
    await checkConfirmRateLimit(guard, userId);

    const tcadIds = [...new Set(input.tcadIds)];
    const proposed = await guard.threadStore.proposedAmong(input.threadId, userId, tcadIds);
    const leadIndex = requireLeadIndex(ctx);
    const leadService = requireLeadService(ctx);

    type Outcome =
      | {
          readonly kind: "created";
          readonly tcadId: string;
          readonly leadKey: string;
          readonly leadId: string;
        }
      | { readonly kind: "already"; readonly tcadId: string }
      | { readonly kind: "failed"; readonly tcadId: string; readonly code: ConfirmFailureCode };
    const fail = (tcadId: string, code: ConfirmFailureCode): Outcome => ({
      kind: "failed",
      tcadId,
      code,
    });

    const outcomes = await mapBounded(
      tcadIds,
      CONFIRM_LEADS_CONCURRENCY,
      async (tcadId): Promise<Outcome> => {
        if (!proposed.has(tcadId)) return fail(tcadId, "NOT_PROPOSED");
        try {
          const property = await propertyByTcadId(leadIndex, tcadId);
          if (property === undefined) return fail(tcadId, "NOT_FOUND");
          const detail = await leadIndex.getProperty(property.propertyCid);
          const lead = leadInputFromProperty(tcadId, property, detail?.permits ?? []);
          if (lead === undefined) return fail(tcadId, "NO_COORDINATES");
          const created = await leadService.create(lead, userId);
          return { kind: "created", tcadId, leadKey: created.leadKey, leadId: created.leadId };
        } catch (error) {
          if (error instanceof LeadAlreadyExistsError) return { kind: "already", tcadId };
          const code = error instanceof IndexNotReadyError ? "INDEX_NOT_READY" : "CREATE_FAILED";
          obs.logger.error("agent.confirmLeads item failed", {
            requestId: ctx.requestId,
            code,
            reason: error instanceof Error ? error.name : "unknown",
          });
          return fail(tcadId, code);
        }
      },
    );

    const result = {
      created: outcomes.flatMap((o) =>
        o.kind === "created" ? [{ tcadId: o.tcadId, leadKey: o.leadKey, leadId: o.leadId }] : [],
      ),
      alreadyLeads: outcomes.flatMap((o) => (o.kind === "already" ? [o.tcadId] : [])),
      failed: outcomes.flatMap((o) =>
        o.kind === "failed" ? [{ tcadId: o.tcadId, code: o.code }] : [],
      ),
    };
    obs.logger.info("agent.confirmLeads done", {
      requestId: ctx.requestId,
      created: result.created.length,
      alreadyLeads: result.alreadyLeads.length,
      failed: result.failed.length,
    });
    return result;
  }),
});

export type AgentRouter = typeof agentRouter;
