import { type Layer, RADIUS_BOUNDS } from "@crm/shared";
import { useSearch } from "../../state.tsx";
import { PERMIT_COLOR, ROOF_AGE_COLORS } from "./layers.ts";

export const clampRadius = (r: number) =>
  Math.min(RADIUS_BOUNDS.max, Math.max(RADIUS_BOUNDS.min, Number.isFinite(r) ? r : RADIUS_BOUNDS.min));

const LAYERS: { id: Layer; label: string }[] = [
  { id: "aged_roofs", label: "Aged roofs" },
  { id: "open_permits", label: "Open roofing permits" },
];

/** Radius (0.25–25 mi) and which lead layers to search. */
export function SearchControls() {
  const { search, update } = useSearch();
  const toggle = (l: Layer) => {
    const next = search.layers.includes(l) ? search.layers.filter((x) => x !== l) : [...search.layers, l];
    if (next.length) update({ layers: next });
  };
  return (
    <section className="search-controls" aria-label="Radius and layers">
      <label className="radius">
        Radius: <output data-testid="radius-value">{search.radiusMiles} mi</output>
        <input
          type="range"
          aria-label="Radius (miles)"
          min={RADIUS_BOUNDS.min}
          max={RADIUS_BOUNDS.max}
          step={0.25}
          value={search.radiusMiles}
          onChange={(e) => update({ radiusMiles: clampRadius(Number(e.target.value)) })}
        />
        <input
          type="number"
          aria-label="Radius in miles"
          min={RADIUS_BOUNDS.min}
          max={RADIUS_BOUNDS.max}
          step={0.25}
          value={search.radiusMiles}
          onChange={(e) => update({ radiusMiles: clampRadius(Number(e.target.value)) })}
        />
      </label>
      <fieldset className="layers">
        <legend>Layers</legend>
        {LAYERS.map((l) => (
          <label key={l.id}>
            <input type="checkbox" checked={search.layers.includes(l.id)} onChange={() => toggle(l.id)} />{" "}
            {l.label}
          </label>
        ))}
      </fieldset>
      <div className="legend" aria-label="Legend">
        {ROOF_AGE_COLORS.map((c) => (
          <span key={c.label}>
            <i style={{ background: c.color }} /> roof {c.label}
          </span>
        ))}
        <span>
          <i style={{ background: PERMIT_COLOR }} /> open permit
        </span>
        <span>
          <i style={{ background: PERMIT_COLOR, outline: "3px solid #111827" }} /> open 5 y +
        </span>
      </div>
    </section>
  );
}
