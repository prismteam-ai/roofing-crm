import { ActiveLeadExists, IllegalTransition, LeadCapExceeded, LeadNotFound } from "@crm/leads-db";
import { OracleContractError, OracleManifestMismatch, OracleUnavailable } from "@crm/oracle-data";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.ts";

const t = initTRPC.context<Context>().create();

/** Domain errors → tRPC codes, so clients get NOT_FOUND / TOO_MANY_REQUESTS instead of 500s. */
export function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  const e = err as Error;
  const code =
    e instanceof LeadNotFound
      ? "NOT_FOUND"
      : e instanceof LeadCapExceeded
        ? "TOO_MANY_REQUESTS"
        : e instanceof IllegalTransition
          ? "BAD_REQUEST"
          : e instanceof ActiveLeadExists
            ? "CONFLICT"
            : e instanceof OracleManifestMismatch
              ? "PRECONDITION_FAILED"
              : e instanceof OracleUnavailable
                ? "SERVICE_UNAVAILABLE"
                : e instanceof OracleContractError
                  ? "BAD_GATEWAY"
                  : "INTERNAL_SERVER_ERROR";
  return new TRPCError({ code, message: e?.message ?? String(err), cause: err });
}

const mapErrors = t.middleware(async ({ next }) => {
  const r = await next();
  if (!r.ok && r.error.code === "INTERNAL_SERVER_ERROR" && r.error.cause) throw toTrpcError(r.error.cause);
  return r;
});

export const router = t.router;
export const procedure = t.procedure.use(mapErrors);
export const createCallerFactory = t.createCallerFactory;
