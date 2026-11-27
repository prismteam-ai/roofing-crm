import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { procedure, router } from "../trpc.ts";

const Id = z.object({ id: z.string().min(1).max(64) });

export const propertyRouter = router({
  get: procedure.input(Id).query(async ({ ctx, input }) => {
    const d = await ctx.deps.oracle.property(input.id);
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: `no property ${input.id} in this run` });
    return d;
  }),
});

export const permitRouter = router({
  get: procedure.input(Id.extend({ id: z.string().min(1).max(128) })).query(async ({ ctx, input }) => {
    const d = await ctx.deps.oracle.permit(input.id);
    if (!d) throw new TRPCError({ code: "NOT_FOUND", message: `no permit ${input.id} in this run` });
    return d;
  }),
});

export const placeRouter = router({
  /** City or place name → center, for setting the search without the map. */
  resolve: procedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .query(({ ctx, input }) => ctx.deps.oracle.resolvePlace(input.name)),
});
