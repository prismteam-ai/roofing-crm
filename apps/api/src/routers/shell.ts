// The app shell's two reads (design-review-log rows 3 and 22: `CrmDataChip`, `CrmAppsMenu`).
// `indexInfo` feeds the top bar's "Data: CountyLens run {id}" chip and its panel from the same
// promoted-run pointer every search/property response is stamped with (LeadIndex.indexInfo +
// currentRunId) — never a hard-coded run. `appLinks` feeds the Apps menu from config: CountyLens
// from EXPLORER_BASE_URL (the lineage link's own setting), the landing page from LANDING_PAGE_URL
// (null when unset, so the menu says it is not available instead of guessing a URL). CountyLens
// is null too when EXPLORER_BASE_URL is unset (infra sets it from cdk context crm:explorerBaseUrl).
import { z } from "zod";
import { mapIndexNotReady, publicProcedure, requireLeadIndex, router } from "../trpc.js";
import { countyLensBaseUrl } from "../services/propertyDetail.js";

export const ShellIndexInfoOutput = z.object({
  manifestCid: z.string(),
  /** Provenance `runId` of the promoted run; null when the run has no property rows. */
  runId: z.string().nullable(),
  promotedAt: z.string(),
  propertyCount: z.number().int().nonnegative(),
  permitCount: z.number().int().nonnegative(),
  traceId: z.string(),
});

export const ShellAppLinksOutput = z.object({
  countyLensUrl: z.string().url().nullable(),
  landingPageUrl: z.string().url().nullable(),
});

export const shellRouter = router({
  indexInfo: publicProcedure
    .input(z.void())
    .output(ShellIndexInfoOutput)
    .query(async ({ ctx }) => {
      const leadIndex = requireLeadIndex(ctx);
      try {
        const info = await leadIndex.indexInfo();
        const runId = await leadIndex.currentRunId();
        return {
          manifestCid: info.manifestCid,
          runId: runId ?? null,
          promotedAt: info.promotedAt,
          propertyCount: info.propertyCount,
          permitCount: info.permitCount,
          traceId: ctx.requestId,
        };
      } catch (error) {
        mapIndexNotReady(error);
      }
    }),

  appLinks: publicProcedure
    .input(z.void())
    .output(ShellAppLinksOutput)
    .query(() => {
      const landing = process.env.LANDING_PAGE_URL;
      return {
        countyLensUrl: countyLensBaseUrl(),
        landingPageUrl: landing === undefined || landing === "" ? null : landing,
      };
    }),
});
