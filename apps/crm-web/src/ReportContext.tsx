import { useEffect, useState } from "react";
import type { SourceContext } from "../../../packages/hosted-runtime/src/source-context";
/** Unmounted with its selected record/session; late context responses cannot reopen evidence. */
export function ReportContext({
  sourceId,
  snapshotId,
  recordId,
}: {
  sourceId: string;
  snapshotId: string;
  recordId: string;
}) {
  const [source, setSource] = useState<SourceContext | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const q = new URLSearchParams({ sourceId, snapshotId }),
      page = recordId.match(/:page:(\d+)/)?.[1];
    if (page) q.set("page", page);
    void fetch(`/api/source-context?${q}`, {
      redirect: "error",
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Unavailable");
        return r.json() as Promise<{ source: SourceContext }>;
      })
      .then((x) => {
        if (live) setSource(x.source);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [sourceId, snapshotId, recordId]);
  if (error)
    return (
      <small>
        Report context unavailable. The recorded citation is retained.
      </small>
    );
  if (!source) return <small>Loading report context…</small>;
  return (
    <div className="report-context" data-testid="source-context">
      <a
        href={source.pageUrl ?? source.officialReportUrl}
        target="_blank"
        rel="noreferrer"
      >
        {source.visibleTitle}
        {source.page ? ` · page ${source.page}` : ""}
      </a>
      <small>
        Official report · retrieved {source.sourceObservedAt.slice(0, 10)} ·
        declared report period: not stated. Observed sale dates{" "}
        {source.observedSaleDateRange.from}–{source.observedSaleDateRange.to}{" "}
        are not a declared report period.
      </small>
      <small>Match: {source.exactPinMatchMethod}</small>
      <small>
        Building year proxy · low confidence; source-reported year does not
        establish roof replacement, condition or continuous tenure.
      </small>
      <small>{source.caveats[0]}</small>
    </div>
  );
}
