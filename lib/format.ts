/**
 * Display formatting helpers (client-safe).
 *
 * @module format
 */
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const int = new Intl.NumberFormat("en-US");

export function formatUsd(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : usd.format(v);
}

export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : int.format(v);
}

/** Fixed locale + county time zone so server and client render identical strings (no hydration drift). */
const TIME_ZONE = "America/New_York";

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "n/a";
  // Date-only ISO strings (e.g. "1998-10-27") are rendered as-is to avoid UTC day shifts.
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00Z`);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "n/a";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMiles(v: number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : `${v.toFixed(2)} mi`;
}

/** "12.3 y" / "200 d" for days-open badges. */
export function formatDuration(days: number | null | undefined): string {
  if (days === null || days === undefined) return "n/a";
  return days < 365 ? `${days} d` : `${(days / 365).toFixed(1)} y`;
}

/** Title-case a shouting appraiser string ("JOHN DOE" -> "John Doe"). */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "n/a";
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
