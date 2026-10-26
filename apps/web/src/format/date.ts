// Date display for contract values (ISO instants such as `2026-09-04T00:00:00.000Z`, or
// date-only `2021-08-09`). Always formatted in UTC: the contract's dates are calendar days stored
// as midnight UTC, so formatting them in the viewer's zone would show the day before west of
// Greenwich. Returns null for a missing or unreadable value so the caller can say why.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parse(value: string | null | undefined): Date | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const date = new Date(DATE_ONLY.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Sep 4, 2026` (the calendar day in UTC), or null when absent/unreadable. */
export function formatDate(value: string | null | undefined, locale = "en-US"): string | null {
  const date = parse(value);
  if (date === null) return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** `Oct 21, 2026, 10:35 UTC`, or null when absent/unreadable. */
export function formatDateTimeUtc(
  value: string | null | undefined,
  locale = "en-US",
): string | null {
  const date = parse(value);
  if (date === null) return null;
  const formatted = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}
