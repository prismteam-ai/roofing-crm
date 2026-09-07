import Link from "next/link";
import { SignalBadge } from "@/components/ui/Badge";
import { formatDate, formatDuration, formatMiles, formatUsd, titleCase } from "@/lib/format";
import type { LeadListItem } from "@/lib/db/leads";
import type { LeadSignal } from "@/lib/queries/types";
import { StatusSelect } from "./StatusSelect";

/** Leads list table with inline status changes. */
export function LeadsTable({ leads }: { leads: LeadListItem[] }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">
        No leads match. Create leads from the{" "}
        <Link href="/" className="text-[var(--brand)] underline">
          map
        </Link>{" "}
        or ask the assistant.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      <table className="w-full min-w-[56rem] text-left text-xs">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2">Lead</th>
            <th className="px-3 py-2">Signal</th>
            <th className="px-3 py-2">Roof age</th>
            <th className="px-3 py-2">Open permit</th>
            <th className="px-3 py-2">Owner</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2">Distance</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-t border-[var(--line)] align-top hover:bg-amber-50/40">
              <td className="px-3 py-2">
                <Link href={`/leads/${l.id}`} className="font-medium text-[var(--brand)] underline">
                  #{l.id} {titleCase(l.address.split(",")[0])}
                </Link>
                <div className="text-[var(--muted)]">
                  {l.address.split(",").slice(1).join(",").trim()}
                </div>
              </td>
              <td className="px-3 py-2">
                <SignalBadge signal={l.signal as LeadSignal} />
                <div className="mt-0.5 capitalize text-[var(--muted)]">{l.priority} priority</div>
              </td>
              <td className="px-3 py-2">
                {l.roofAgeYears === null ? "unknown" : `${l.roofAgeYears} y`}
                <div className="text-[var(--muted)]">{l.roofAgeBasis?.replace("_", " ")}</div>
              </td>
              <td className="px-3 py-2">
                {l.openRoofPermitCount > 0 ? (
                  <>
                    <span className="font-medium text-orange-800">
                      {formatDuration(l.oldestOpenRoofPermitDays)}
                    </span>
                    <div className="text-[var(--muted)]">
                      {l.openRoofPermitCount} open · {l.permitCount} snapshotted
                    </div>
                  </>
                ) : (
                  <span className="text-[var(--muted)]">none · {l.permitCount} snapshotted</span>
                )}
              </td>
              <td className="px-3 py-2">
                {titleCase(l.ownerName)}
                {l.ownerOutOfState && (
                  <div className="text-[var(--muted)]">out of state ({l.ownerMailState})</div>
                )}
              </td>
              <td className="px-3 py-2">{formatUsd(l.marketValue)}</td>
              <td className="px-3 py-2">
                {l.distanceMiles === null ? "-" : formatMiles(l.distanceMiles)}
              </td>
              <td className="px-3 py-2">
                <StatusSelect leadId={l.id} status={l.status} />
              </td>
              <td className="px-3 py-2 text-[var(--muted)]">{formatDate(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
