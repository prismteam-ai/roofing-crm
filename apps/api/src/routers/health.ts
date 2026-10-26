// contracts/health.md: the only tRPC procedure this story exposes. Public (no JWT authorizer),
// Zod-validated input/output. T008 makes test/handlers/health.test.ts (T006) pass.
import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

export const HealthPingOutput = z.object({
  ok: z.literal(true),
  timestamp: z.string(),
});
export type HealthPingOutput = z.infer<typeof HealthPingOutput>;

export const healthRouter = router({
  ping: publicProcedure
    .input(z.void())
    .output(HealthPingOutput)
    .query(() => ({
      ok: true as const,
      timestamp: new Date().toISOString(),
    })),
});
