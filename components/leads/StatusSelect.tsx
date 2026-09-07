"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/db/schema";

/** Window event fired after a successful inline status change (optimistic count updates). */
export const LEAD_STATUS_EVENT = "crm:lead-status-changed";
export interface LeadStatusChange {
  leadId: number;
  from: LeadStatus;
  to: LeadStatus;
}

/** Inline status dropdown that PATCHes the lead and refreshes server data. */
export function StatusSelect({
  leadId,
  status,
  className = "",
}: {
  leadId: number;
  status: LeadStatus;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<LeadStatus>(status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <select
        aria-label="Lead status"
        className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs capitalize disabled:opacity-60"
        value={value}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value as LeadStatus;
          const prev = value;
          setValue(next);
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/leads/${leadId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ status: next }),
            });
            if (!res.ok)
              throw new Error(((await res.json()) as { error?: string }).error ?? "Update failed");
            window.dispatchEvent(
              new CustomEvent<LeadStatusChange>(LEAD_STATUS_EVENT, {
                detail: { leadId, from: prev, to: next },
              }),
            );
            router.refresh();
          } catch (err) {
            setValue(prev);
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
