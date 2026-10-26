// Whether the map legend card is open. One shared state so the Layers button's "Legend" switch and
// the card itself always agree. It is open by default at every width (the PO's call, 2026-10-26:
// the legend explains the hexagons, rings and permit colours, so it should be there from the first
// look); from 600 px it has its own corner of the map, on a phone it floats over it and the Layers
// switch turns it off. A person's own choice (kept for the session) wins over the default.
import { useCallback, useSyncExternalStore } from "react";

/** From here the legend card is in its own corner of the map (below it, it floats over the map). */
export const LEGEND_OPEN_QUERY = "(min-width: 600px)";
const LEGEND_KEY = "crm.legend.v1";

const listeners = new Set<() => void>();
/** Only used when sessionStorage is blocked: the choice then lasts for this page load. */
let memoryChoice: boolean | null = null;

export function matchesMedia(query: string, fallback: boolean): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return fallback;
  return window.matchMedia(query).matches;
}

export function readLegendChoice(): boolean | null {
  try {
    const stored = sessionStorage.getItem(LEGEND_KEY);
    if (stored === "open") return true;
    if (stored === "closed") return false;
    return null;
  } catch {
    return memoryChoice;
  }
}

export function writeLegendChoice(open: boolean): void {
  try {
    sessionStorage.setItem(LEGEND_KEY, open ? "open" : "closed");
  } catch {
    memoryChoice = open;
  }
  for (const notify of [...listeners]) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(LEGEND_OPEN_QUERY)
      : null;
  media?.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener("change", onChange);
  };
}

/** `[open, setOpen]` for the legend card. */
export function useLegendOpen(): readonly [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => readLegendChoice() ?? true,
    () => true,
  );
  const set = useCallback((next: boolean) => writeLegendChoice(next), []);
  return [open, set];
}

/** True from 600 px: the legend card sits in the map's corner rather than floating over it. */
export function useLegendDocked(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => undefined;
      }
      const list = window.matchMedia(LEGEND_OPEN_QUERY);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => matchesMedia(LEGEND_OPEN_QUERY, true),
    () => true,
  );
}
