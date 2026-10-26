// tRPC init (plan.md "Patterns the code must show"). One root `t` for the whole AppRouter; every
// procedure's input is Zod-validated (constitution P0-11, Article V). The Cognito JWT authorizer
// runs in API Gateway before a request reaches the Lambda (architecture-constitution.md § Data
// Flow), so there is no auth middleware here — `health.ping` and `auth.reportFailedAttempt` are
// the two routes API Gateway lets through without a token (contracts/health.md; the latter found
// deploying — see routers/auth.ts — it's called before any session exists, same reason as
// health.ping), and every other route never reaches this file without a validated token already
// attached to the request context.
import { initTRPC, TRPCError } from "@trpc/server";
import type { LanguageModel } from "ai";
import { IndexNotReadyError, type LeadIndex } from "./adapters/duckDbParquet.js";
import type { LeadRepo } from "./adapters/leadRepo.js";
import type { LeadService } from "./services/leads.js";

export interface TrpcContext {
  readonly requestId: string;
  /** B-03 (search/property routers): the existing B-02 `LeadIndex` port, injected by the Lambda
   *  handler's `createContext` (apps/api/src/leadIndex.ts's `tryLeadIndex`). Optional so
   *  `health`/`auth` (and their existing tests, which construct a context with only `requestId`)
   *  are never forced to supply one; `search`/`property` procedures fail fast with a typed error
   *  instead of an `undefined` crash when it is missing. */
  readonly leadIndex?: LeadIndex;
  /** B-07: the Application-layer lead service, built in `createContext` with an injected
   *  `LeadRepo` (never imported by the service). Optional for the same reason as `leadIndex`. */
  readonly leadService?: LeadService;
  /** B-07: the caller's Cognito `sub`, read from the API Gateway JWT authorizer claims. */
  readonly userId?: string;
  /** B-09: the `LeadRepo` port, used only by `services/agent/tools.ts`'s `proposeLeads` tool for
   *  its read-only duplicate check (never for a write — T029's import guard). Optional: a test
   *  that never exercises `proposeLeads` (e.g. `agent.ask.test.ts`) never has to supply one; a
   *  real request falls back to a lazily-built DynamoDB-backed instance (`agent/usageGuard.ts`'s
   *  sibling pattern in `routers/agent.ts`). */
  readonly leadRepo?: LeadRepo;
  /** B-09: the Vercel AI SDK model `agent.ask` calls through `agent/composeAnswer.ts`'s `runAsk`
   *  (the plan call, at most one repair call, and the compose call — ADR-06 §6.1, no tools ever
   *  passed). Optional so a test can inject a `MockLanguageModelV4`; a real request falls back to
   *  `agent/getModel.ts`'s `AI_PROVIDER` switch. */
  readonly model?: LanguageModel;
}

/** `search`/`property` procedures call this first — never destructure `ctx.leadIndex` directly
 *  (it would throw "Cannot read properties of undefined" with no typed code). Typed by shape
 *  (`{ leadIndex: LeadIndex | undefined }`) rather than `TrpcContext` itself: tRPC's own resolved
 *  context type for a `.query(({ ctx }) => ...)` callback widens every optional property to an
 *  explicit union with `undefined`, which `exactOptionalPropertyTypes` treats as a different —
 *  and here, more precise — shape than `TrpcContext`'s own optional declaration. */
export function requireLeadIndex(ctx: { leadIndex: LeadIndex | undefined }): LeadIndex {
  if (ctx.leadIndex === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeadIndex not wired into this Lambda's tRPC context",
    });
  }
  return ctx.leadIndex;
}

/** `leads` procedures call this first; a missing service is a typed wiring error, not a crash. */
export function requireLeadService(ctx: { leadService: LeadService | undefined }): LeadService {
  if (ctx.leadService === undefined) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LeadService not wired into this Lambda's tRPC context",
    });
  }
  return ctx.leadService;
}

/** The Cognito authorizer runs before the Lambda; a missing `sub` means the route was reached
 *  without a validated token, so refuse rather than write a lead with no owner. */
export function requireUserId(ctx: { userId: string | undefined }): string {
  if (ctx.userId === undefined || ctx.userId === "") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return ctx.userId;
}

/** A typed, honest "index not ready" response (never a bare 500) when no run has ever been
 *  promoted — shared by search/property/agent routers. */
export function mapIndexNotReady(error: unknown): never {
  if (error instanceof IndexNotReadyError) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error.message, cause: error });
  }
  throw error;
}

/** Attaches a domain `code` to an `Error`'s `cause`, read back out by `withAppCode` below. */
export function causeWithCode(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** tRPC drops `cause` from the wire error, so a domain code carried on it (ALREADY_EXISTS,
 *  STALE_SEQUENCE) is surfaced as `data.appCode`; the web client keys off that, not the message. */
export function withAppCode<D extends object>(
  shape: { data: D },
  cause: unknown,
): { data: D & { appCode?: string } } {
  const code = (cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? { data: { ...shape.data, appCode: code } } : shape;
}

const t = initTRPC.context<TrpcContext>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: withAppCode(shape, error.cause).data,
  }),
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
