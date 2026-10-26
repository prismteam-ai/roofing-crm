// `property.get` (contracts/property-detail.md): the detail drawer. Thin-router extraction
// (tasks.md T013, agent-design.md alakazam §1): the business logic now lives in
// ../services/propertyDetail.ts, shared with the new agent `getProperty` tool (Phase 4) — this
// router only validates input, calls the service, and shapes the tRPC response
// (traceId, typed error mapping).
import { z } from "zod";
import { CidV1 } from "@crm/index-schema";
import { mapIndexNotReady, publicProcedure, requireLeadIndex, router } from "../trpc.js";
import { propertyDetail } from "../services/propertyDetail.js";

export const propertyRouter = router({
  get: publicProcedure.input(z.object({ propertyCid: CidV1 })).query(async ({ input, ctx }) => {
    const leadIndex = requireLeadIndex(ctx);
    try {
      const result = await propertyDetail(leadIndex, input.propertyCid);
      return { ...result, traceId: ctx.requestId };
    } catch (error) {
      mapIndexNotReady(error);
    }
  }),
});
