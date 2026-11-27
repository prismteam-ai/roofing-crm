import { procedure, router } from "../trpc.ts";

export const metaRouter = router({
  /** Which run the CRM reads and whether the Oracle serves it (degraded banner, Review Focus 6). */
  snapshot: procedure.query(async ({ ctx }) => {
    const { oracle } = ctx.deps;
    const base = {
      manifestCid: oracle.manifestCid,
      viewsVersion: null as string | null,
      counts: {} as Record<string, number>,
    };
    try {
      const h = await oracle.health();
      if (h.mismatch) {
        return {
          ...base,
          oracleHealthy: h.ok,
          manifestMismatch: true,
          servedManifestCid: h.manifestCid,
          asOf: null,
          runId: null,
        };
      }
      const d = await oracle.dataset();
      return {
        ...base,
        viewsVersion: d.viewsVersion,
        counts: d.counts,
        oracleHealthy: h.ok,
        manifestMismatch: false,
        servedManifestCid: h.manifestCid,
        asOf: d.asOf,
        runId: d.runId,
      };
    } catch {
      return {
        ...base,
        oracleHealthy: false,
        manifestMismatch: false,
        servedManifestCid: null,
        asOf: null,
        runId: null,
      };
    }
  }),
});
