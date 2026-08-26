/**
 * Computes how long a roofing permit has been open from published date fields.
 *
 * Null when the permit is closed, dates are missing, or the year cannot be parsed.
 * Callers must not invent close dates or substitute roof-install years.
 */

/**
 * Reads a four-digit calendar year from an ISO-like date string.
 */
export function parseCalendarYearFromDateString(dateString: string): number | null {
  const trimmed = dateString.trim();
  if (trimmed.length < 4) {
    return null;
  }
  const year = Number.parseInt(trimmed.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1800 || year > 3000) {
    return null;
  }
  return year;
}

/**
 * Returns whole years a permit has been open, or null when not rankable.
 *
 * Uses `openedDate`, then `issuedDate`. Closed permits (non-empty `closedDate`)
 * return null so long-open ranking stays honest.
 */
export function resolvePropertyPermitOpenYears(arguments_: {
  openedDate: string | null;
  issuedDate: string | null;
  closedDate: string | null;
  currentUtcYear: number;
}): number | null {
  if (arguments_.closedDate !== null && arguments_.closedDate.trim().length > 0) {
    return null;
  }

  const startDate =
    arguments_.openedDate !== null && arguments_.openedDate.trim().length > 0
      ? arguments_.openedDate
      : arguments_.issuedDate;

  if (startDate === null || startDate.trim().length === 0) {
    return null;
  }

  const startYear = parseCalendarYearFromDateString(startDate);
  if (startYear === null) {
    return null;
  }

  return Math.max(0, arguments_.currentUtcYear - startYear);
}
