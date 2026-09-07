"use client";

import { COUNTIES, OSCEOLA, RADIUS_MILES } from "@/lib/config/county";
import type { LatLng } from "@/lib/queries/geo";
import type { SearchForm } from "./types";

export interface SearchControlsProps {
  form: SearchForm;
  center: LatLng | null;
  locating: boolean;
  onChange: (patch: Partial<SearchForm>) => void;
  onUseMyLocation: () => void;
  onPickPlace: (p: LatLng) => void;
  onClearPin: () => void;
}

/** Left-hand control panel: county, location, radius, thresholds and signal toggles. */
export function SearchControls({
  form,
  center,
  locating,
  onChange,
  onUseMyLocation,
  onPickPlace,
  onClearPin,
}: SearchControlsProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <label
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
          htmlFor="county"
        >
          County
        </label>
        <select
          id="county"
          className="w-full rounded-md border border-[var(--line)] bg-white px-2 py-1.5"
          value={OSCEOLA.key}
          onChange={() => undefined}
        >
          {COUNTIES.map((c) => (
            <option key={c.key} value={c.key} disabled={!c.enabled}>
              {c.label}
              {c.enabled ? "" : " (coming soon)"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Search center
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={locating}
            className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {locating ? "Locating..." : "Use my location"}
          </button>
          <select
            aria-label="Jump to a place"
            className="rounded-md border border-[var(--line)] bg-white px-2 py-1.5 text-xs"
            value=""
            onChange={(e) => {
              const p = OSCEOLA.places.find((pl) => pl.name === e.target.value);
              if (p) onPickPlace({ lat: p.lat, lng: p.lng });
            }}
          >
            <option value="">Jump to place...</option>
            {OSCEOLA.places.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          {center ? (
            <>
              Pin at {center.lat.toFixed(4)}, {center.lng.toFixed(4)}{" "}
              <button type="button" className="underline" onClick={onClearPin}>
                clear
              </button>
            </>
          ) : (
            "Click the map to drop a pin, or use your location."
          )}
        </p>
      </div>

      <div>
        <label
          className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
          htmlFor="radius"
        >
          <span>Radius</span>
          <span className="font-normal normal-case text-[var(--ink)]">{form.radiusMiles} mi</span>
        </label>
        <input
          id="radius"
          type="range"
          min={RADIUS_MILES.min}
          max={RADIUS_MILES.max}
          step={RADIUS_MILES.step}
          value={form.radiusMiles}
          onChange={(e) => onChange({ radiusMiles: Number(e.target.value) })}
          className="w-full accent-[var(--brand)]"
        />
      </div>

      <div>
        <label
          className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
          htmlFor="roofAge"
        >
          <span>Roof age threshold</span>
          <span className="font-normal normal-case text-[var(--ink)]">
            &ge; {form.roofAgeMin} years
          </span>
        </label>
        <input
          id="roofAge"
          type="range"
          min={0}
          max={60}
          step={1}
          value={form.roofAgeMin}
          onChange={(e) => onChange({ roofAgeMin: Number(e.target.value) })}
          className="w-full accent-[var(--brand)]"
        />
        <p className="mt-1 text-xs text-[var(--muted)]">
          {form.agedRoofsOnly
            ? "Only roofs at or above this age are listed."
            : "Roofs at or above this age, plus any property with an open roofing permit (marked \u201cpermit only\u201d). Tick \u201cAged roofs only\u201d to hide permit-only matches."}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Signals
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.openPermitsOnly}
            onChange={(e) =>
              onChange({
                openPermitsOnly: e.target.checked,
                ...(e.target.checked ? { agedRoofsOnly: false } : {}),
              })
            }
          />
          Open roofing permits only
        </label>
        <label
          className="flex items-center gap-2"
          title="Hide parcels that qualify only because of an open permit"
        >
          <input
            type="checkbox"
            checked={form.agedRoofsOnly}
            onChange={(e) =>
              onChange({
                agedRoofsOnly: e.target.checked,
                ...(e.target.checked ? { openPermitsOnly: false } : {}),
              })
            }
          />
          Aged roofs only (hide permit-only matches)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.longOpenEnabled}
            onChange={(e) => onChange({ longOpenEnabled: e.target.checked })}
          />
          Long-open permits (&ge;
          <input
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={form.longOpenYears}
            onChange={(e) => onChange({ longOpenYears: Number(e.target.value) })}
            className="w-14 rounded border border-[var(--line)] px-1 py-0.5 text-xs"
            aria-label="Years open"
          />
          years)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.ownerOutOfState}
            onChange={(e) => onChange({ ownerOutOfState: e.target.checked })}
          />
          Owner out of state
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.noSaleEnabled}
            onChange={(e) => onChange({ noSaleEnabled: e.target.checked })}
          />
          No sale in
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.noSaleYears}
            onChange={(e) => onChange({ noSaleYears: Number(e.target.value) })}
            className="w-14 rounded border border-[var(--line)] px-1 py-0.5 text-xs"
            aria-label="Years since sale"
          />
          + years
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.ratedContractorOnly}
            onChange={(e) => onChange({ ratedContractorOnly: e.target.checked })}
          />
          Rated contractor only (BBB)
        </label>
        <label className="mt-1 flex items-center justify-between gap-2">
          <span>Property type</span>
          <select
            value={form.propertyType}
            onChange={(e) =>
              onChange({ propertyType: e.target.value as SearchForm["propertyType"] })
            }
            className="rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs"
          >
            <option value="all">All</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
      </fieldset>

      <div className="rounded-md bg-gray-50 p-2 text-[11px] leading-relaxed text-[var(--muted)]">
        <div className="mb-1 font-semibold text-gray-700">Marker legend</div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[var(--signal-long-open)]" />{" "}
          Long-open roofing permit
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[var(--signal-open)]" /> Open
          roofing permit
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-[var(--signal-aged)]" /> Roof older
          than threshold
        </div>
      </div>
    </div>
  );
}
