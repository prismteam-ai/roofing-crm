// True from the width where the Lead page sits beside the Leads list (CRM-HANDOFF 4.6: 1440 shows
// the list on the left, 768 and 390 are a full page). Without `matchMedia` (jsdom) it is false, so
// the single-column page renders and the list is never fetched for nothing.
import { useEffect, useState } from "react";

export const LEAD_SPLIT_MIN_WIDTH = 1200;

export function useWide(minWidth: number = LEAD_SPLIT_MIN_WIDTH): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const read = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [wide, setWide] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const onChange = (): void => setWide(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return wide;
}
