"use client";

import { useEffect, useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/db/schema";
import { LEAD_STATUS_EVENT, type LeadStatusChange } from "./StatusSelect";

/**
 * Per-status lead counts. Seeded from the server, updated optimistically when an inline
 * status change fires `LEAD_STATUS_EVENT`, and re-seeded when the server re-renders.
 */
export function StatusSummary({ counts }: { counts: Record<LeadStatus, number> }) {
  const [local, setLocal] = useState(counts);
  useEffect(() => setLocal(counts), [counts]);
  useEffect(() => {
    const onChange = (e: Event) => {
      const { from, to } = (e as CustomEvent<LeadStatusChange>).detail;
      if (from === to) return;
      setLocal((c) => ({ ...c, [from]: Math.max(0, c[from] - 1), [to]: c[to] + 1 }));
    };
    window.addEventListener(LEAD_STATUS_EVENT, onChange);
    return () => window.removeEventListener(LEAD_STATUS_EVENT, onChange);
  }, []);
  const total = Object.values(local).reduce((a, b) => a + b, 0);
  return (
    <p className="text-sm text-[var(--muted)]" aria-live="polite">
      {total} total · {LEAD_STATUSES.map((s) => `${local[s]} ${s}`).join(" · ")}
    </p>
  );
}
