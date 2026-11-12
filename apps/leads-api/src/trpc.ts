import { initTRPC, TRPCError } from "@trpc/server";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/** Structural types so tests can pass plain fakes for Powertools. */
export interface LoggerLike {
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: unknown): void;
}
export interface MetricsLike {
  addMetric(name: string, unit: "Count", value: number): void;
}

export interface Ctx {
  db: DynamoDBDocumentClient;
  tableName: string;
  /** Client name from the shared authorizer's context (undefined when absent). */
  client: string | undefined;
  logger: LoggerLike;
  metrics: MetricsLike;
  now: () => Date;
}

/** The only client allowed to use the leads API. */
export const LEADS_CLIENT = "crm";

const t = initTRPC.context<Ctx>().create();
export const router = t.router;

/** Every procedure requires the authorizer's client name, and it must be "crm". */
export const procedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.client)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "missing client in the authorizer context",
    });
  if (ctx.client !== LEADS_CLIENT)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "this client may not use the leads API",
    });
  return next();
});
