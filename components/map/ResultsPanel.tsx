"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignalBadge } from "@/components/ui/Badge";
import { formatDuration, formatInt, formatUsd, titleCase } from "@/lib/format";
import type { PropertyCandidate } from "@/lib/queries/types";
import type { SearchResponse } from "./types";

type SortCol = "priority" | "roofAge" | "daysOpen" | "value" | "distance" | "address";

export interface ResultsPanelProps {
  result: SearchResponse | null;
  loading: boolean;
  error: string | null;
  selectedIds: ReadonlySet<string>;
  activeParcelId: string | null;
  creating: boolean;
  createMessage: { text: string; leadIds: number[] } | null;
  onToggleSelect: (parcelId: string) => void;
  onSelectAllVisible: (ids: string[]) => void;
  onClearSelection: () => void;
  onOpen: (parcelId: string) => void;
  onCreateLeads: () => void;
}

const SIGNAL_RANK = { long_open_permit: 0, open_permit: 1, aged_roof: 2, none: 3 } as const;

function sortRows(rows: PropertyCandidate[], col: SortCol, dir: 1 | -1): PropertyCandidate[] {
  const cmp = (a: PropertyCandidate, b: PropertyCandidate): number => {
    switch (col) {
      case "roofAge":
        return (a.roofAgeYears ?? -1) - (b.roofAgeYears ?? -1);
      case "daysOpen":
        return (a.oldestOpenRoofPermitDays ?? -1) - (b.oldestOpenRoofPermitDays ?? -1);
      case "value":
        return (a.marketValue ?? -1) - (b.marketValue ?? -1);
      case "distance":
        return (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9);
      case "address":
        return a.address.localeCompare(b.address);
      case "priority":
      default: {
        const s = SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal];
        if (s !== 0) return -s; // lower rank = higher priority; invert so dir=-1 puts priority first
        const d = (a.oldestOpenRoofPermitDays ?? -1) - (b.oldestOpenRoofPermitDays ?? -1);
        if (d !== 0) return d;
        return (a.roofAgeYears ?? -1) - (b.roofAgeYears ?? -1);
      }
    }
  };
  return [...rows].sort((a, b) => dir * cmp(a, b));
}

/** Right-hand results list: totals, sortable candidate rows, multi-select and lead creation. */
export function ResultsPanel(props: ResultsPanelProps) {
  const { result, loading, error, selectedIds, activeParcelId, creating, createMessage } = props;
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "priority", dir: -1 });
  const rows = useMemo(
    () => (result ? sortRows(result.rows, sort.col, sort.dir) : []),
    [result, sort],
  );

  const header = (col: SortCol, label: string) => (
    <button
      type="button"
      className={`text-left text-[11px] font-semibold uppercase tracking-wide ${sort.col === col ? "text-[var(--brand)]" : "text-[var(--muted)]"}`}
      onClick={() => setSort((s) => ({ col, dir: s.col === col ? ((s.dir * -1) as 1 | -1) : -1 }))}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sort.col === col ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Candidates</h2>
          {loading && <span className="text-xs text-[var(--muted)]">Searching...</span>}
        </div>
        {result && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
            <span>
              <strong className="text-[var(--ink)]">{formatInt(result.totals.total)}</strong> match
              {result.truncated ? ` (showing top ${result.rows.length})` : ""}
            </span>
            <span>
              {formatInt(result.totals.agedRoofs)} roofs &ge; {result.params.roofAgeMin} y
            </span>
            <span>{formatInt(result.totals.openPermits)} open permits</span>
            <span>{formatInt(result.totals.longOpenPermits)} long-open</span>
            <span>{formatInt(result.totals.outOfStateOwners)} out-of-state owners</span>
            <span>{formatInt(result.totals.bbbParcels)} with BBB-rated contractor</span>
          </div>
        )}
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] bg-gray-50 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="underline"
            onClick={() => props.onSelectAllVisible(rows.slice(0, 50).map((r) => r.parcelId))}
          >
            Select top 50
          </button>
          <button
            type="button"
            className="underline"
            onClick={props.onClearSelection}
            disabled={selectedIds.size === 0}
          >
            Clear
          </button>
        </div>
        <button
          type="button"
          onClick={props.onCreateLeads}
          disabled={selectedIds.size === 0 || creating}
          className="rounded-md bg-[var(--brand)] px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          {creating
            ? "Creating..."
            : `Create ${selectedIds.size || ""} lead${selectedIds.size === 1 ? "" : "s"}`}
        </button>
      </div>
      {createMessage && (
        <div
          className="border-b border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-800"
          role="status"
        >
          {createMessage.text}{" "}
          <Link href="/leads" className="underline">
            Open leads
          </Link>
        </div>
      )}

      <div className="grid grid-cols-[1.5rem_1fr_5rem_5.5rem] gap-2 border-b border-[var(--line)] px-3 py-1.5">
        <span />
        {header("address", "Address")}
        {header("roofAge", "Roof")}
        {header("daysOpen", "Permit")}
      </div>
      <div className="flex gap-3 px-3 py-1 text-[10px] text-[var(--muted)]">
        <span>sort:</span>
        {header("priority", "priority")}
        {header("roofAge", "roof age")}
        {header("value", "value")}
        {header("distance", "distance")}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Candidate roofs">
        {!result && !loading && (
          <li className="p-4 text-sm text-[var(--muted)]">Drop a pin to search.</li>
        )}
        {result && rows.length === 0 && !loading && (
          <li className="p-4 text-sm text-[var(--muted)]">No properties match these filters.</li>
        )}
        {rows.map((r) => {
          const leadId = result?.leadIds[r.parcelId];
          const active = r.parcelId === activeParcelId;
          return (
            <li
              key={r.parcelId}
              className={`grid cursor-pointer grid-cols-[1.5rem_1fr_5rem_5.5rem] items-start gap-2 border-b border-[var(--line)] px-3 py-2 text-xs hover:bg-amber-50/50 ${active ? "bg-amber-50" : ""}`}
              onClick={() => props.onOpen(r.parcelId)}
            >
              <input
                type="checkbox"
                aria-label={`Select ${r.address}`}
                checked={selectedIds.has(r.parcelId)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => props.onToggleSelect(r.parcelId)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {titleCase(r.street)}
                  {r.city ? `, ${titleCase(r.city)}` : ""}
                </div>
                <div className="truncate text-[var(--muted)]">
                  {titleCase(r.ownerName)}{" "}
                  {r.ownerOutOfState ? `(${r.ownerMailState ?? "out of state"})` : ""} ·{" "}
                  {formatUsd(r.marketValue)}
                  {r.distanceMiles !== null ? ` · ${r.distanceMiles.toFixed(2)} mi` : ""}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  <SignalBadge signal={r.signal} />
                  {r.hasBbbContractor && (
                    <span
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                      title={
                        r.bbbBestRating
                          ? `Best BBB rating ${r.bbbBestRating}${r.bbbContractorName ? ` (${titleCase(r.bbbContractorName)})` : ""}${r.bbbMatchMethod ? `, matched by ${r.bbbMatchMethod}` : ""}`
                          : "A permit on this parcel has a BBB-rated contractor"
                      }
                    >
                      {r.bbbBestRating ? `BBB ${r.bbbBestRating}` : "BBB-rated contractor"}
                    </span>
                  )}
                  {leadId && (
                    <Link
                      href={`/leads/${leadId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700"
                    >
                      Lead #{leadId}
                    </Link>
                  )}
                </div>
              </div>
              <div>
                <div className="font-medium">
                  {r.roofAgeYears === null ? "unknown" : `${r.roofAgeYears} y`}
                  {r.openRoofPermitCount > 0 &&
                    (r.roofAgeYears ?? -1) < (result?.params.roofAgeMin ?? 0) && (
                      <span
                        className="ml-1 rounded border border-gray-200 bg-gray-50 px-1 py-px text-[10px] font-normal text-[var(--muted)]"
                        title={`Below the ${result?.params.roofAgeMin ?? 0} y threshold; listed because of an open roofing permit`}
                      >
                        permit only
                      </span>
                    )}
                </div>
                <div className="text-[var(--muted)]">{r.roofAgeBasis.replace("_", " ")}</div>
              </div>
              <div>
                {r.openRoofPermitCount > 0 ? (
                  <>
                    <div className="font-medium text-orange-800">
                      {r.oldestOpenRoofPermitDays === null
                        ? "open"
                        : `${formatDuration(r.oldestOpenRoofPermitDays)} open`}
                    </div>
                    <div className="text-[var(--muted)]">{r.openRoofPermitCount} open</div>
                  </>
                ) : (
                  <div className="text-[var(--muted)]">{r.permitCount} permits</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
