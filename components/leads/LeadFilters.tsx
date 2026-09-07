"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { OSCEOLA } from "@/lib/config/county";
import { LEAD_STATUSES } from "@/lib/db/schema";

/** URL-driven filter bar for the leads list. */
export function LeadFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      // Read the live URL rather than the captured `params` so rapid successive edits
      // (e.g. typing in a number field) never overwrite each other.
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router],
  );

  const hasRadius = params.has("lat");
  return (
    <form className="flex flex-wrap items-end gap-3 text-xs" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1">
        <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">Status</span>
        <select
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1"
          value={params.get("status") ?? ""}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">Any</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">
          Roof age &ge;
        </span>
        <input
          type="number"
          min={0}
          max={150}
          className="w-20 rounded-md border border-[var(--line)] px-2 py-1"
          value={params.get("roofAgeMin") ?? ""}
          placeholder="any"
          onChange={(e) => update({ roofAgeMin: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">
          Permit status
        </span>
        <select
          className="rounded-md border border-[var(--line)] bg-white px-2 py-1"
          value={params.get("permitStatus") ?? "any"}
          onChange={(e) =>
            update({ permitStatus: e.target.value === "any" ? null : e.target.value })
          }
        >
          <option value="any">Any</option>
          <option value="open">Open roofing permit</option>
          <option value="long_open">Long-open (&ge; days below)</option>
          <option value="none">No open permit</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">
          Open &ge; days
        </span>
        <input
          type="number"
          min={0}
          className="w-24 rounded-md border border-[var(--line)] px-2 py-1"
          value={params.get("openDaysMin") ?? ""}
          placeholder={String(OSCEOLA.thresholds.longOpenPermitYears * 365)}
          onChange={(e) => update({ openDaysMin: e.target.value })}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="font-semibold uppercase tracking-wide text-[var(--muted)]">
          Within radius of
        </span>
        <div className="flex items-center gap-1">
          <select
            className="rounded-md border border-[var(--line)] bg-white px-2 py-1"
            value={hasRadius ? `${params.get("lat")},${params.get("lng")}` : ""}
            onChange={(e) => {
              if (!e.target.value) return update({ lat: null, lng: null, radiusMiles: null });
              const [lat, lng] = e.target.value.split(",");
              update({
                lat: lat ?? null,
                lng: lng ?? null,
                radiusMiles: params.get("radiusMiles") ?? "5",
              });
            }}
          >
            <option value="">Anywhere</option>
            {OSCEOLA.places.map((p) => (
              <option key={p.name} value={`${p.lat},${p.lng}`}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            className="w-16 rounded-md border border-[var(--line)] px-2 py-1"
            value={params.get("radiusMiles") ?? "5"}
            disabled={!hasRadius}
            onChange={(e) => update({ radiusMiles: e.target.value })}
            aria-label="Radius miles"
          />
          <span>mi</span>
        </div>
      </div>
      <button
        type="button"
        className="rounded-md border border-[var(--line)] px-2 py-1"
        onClick={() => router.replace(pathname)}
      >
        Reset
      </button>
    </form>
  );
}
