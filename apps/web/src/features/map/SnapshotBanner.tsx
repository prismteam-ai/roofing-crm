import { useQuery } from "@tanstack/react-query";
import { shortCid } from "../../lib/format.ts";
import { useTRPC } from "../../lib/trpc.ts";

/**
 * What the pinned run (manifest bafkreiaw4j…, run 2) does not have, said where every search starts.
 * Update with the manifest in deploy/hosted.json.
 */
export const RUN_LIMITS =
  "No BBB grades in this run (BBB blocked automated access) · Fort Lauderdale permit statuses are as of January 2021";

/** Which Oracle run the CRM reads; degraded banner when the Oracle is down or serves another run. */
export function SnapshotBanner() {
  const trpc = useTRPC();
  const q = useQuery({ ...trpc.meta.snapshot.queryOptions(), refetchInterval: 60_000 });
  if (!q.data) return null;
  const s = q.data;
  if (s.manifestMismatch) {
    return (
      <div className="banner degraded" role="alert">
        <strong>Data run mismatch.</strong> The CRM expects run <code>{s.manifestCid}</code> but the Oracle
        serves <code>{s.servedManifestCid ?? "an unpublished run"}</code>. Property search is paused so runs
        are never mixed; leads keep working.
      </div>
    );
  }
  if (!s.oracleHealthy) {
    return (
      <div className="banner degraded" role="alert">
        <strong>Property data is unavailable.</strong> The Oracle for run <code>{s.manifestCid}</code> is not
        answering. Leads keep working; search will resume when it is back.
      </div>
    );
  }
  return (
    <div className="banner ok" role="status" title={s.manifestCid}>
      Broward County data · run {s.runId} · as of {s.asOf} · {(s.counts.v_property ?? 0).toLocaleString()}{" "}
      properties · manifest <code>{shortCid(s.manifestCid)}</code>
      <span className="banner-limits"> · {RUN_LIMITS}</span>
    </div>
  );
}
