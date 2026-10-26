// Long-open badge rule (agent-design.md §3, data-model.md): a strict boolean on the vendored
// `openDays` value, never re-derived from `issueDate` (ADR-07). 5 years × 365.25 ≈ 1826 days,
// rounded down — `isLongOpen(1826) === false`, `isLongOpen(1827) === true` (tasks.md T004).
import { DAYS_PER_YEAR } from "./constants.js";

export const LONG_OPEN_THRESHOLD_DAYS = Math.floor(5 * DAYS_PER_YEAR);

export function isLongOpen(openDays: number | null): boolean {
  return openDays !== null && openDays > LONG_OPEN_THRESHOLD_DAYS;
}

/** Human-readable open-duration label; never recomputes `openDays` itself (data-model.md). */
export function openDurationLabel(openDays: number | null): string {
  if (openDays === null) return "open duration not available";
  const years = openDays / DAYS_PER_YEAR;
  if (years >= 1) {
    const rounded = Math.round(years * 10) / 10;
    return `open ${rounded} ${rounded === 1 ? "year" : "years"}`;
  }
  return `open ${openDays} ${openDays === 1 ? "day" : "days"}`;
}
