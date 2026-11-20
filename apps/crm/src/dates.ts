/** An ISO timestamp (2026-11-12T13:10:47.174Z): its date is the first ten characters. */
const TIMESTAMP =
  /(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g;

/**
 * Dates as dates: every ISO timestamp in the text is shown as its date, YYYY-MM-DD; a range whose two ends fall on
 * the same date ("D to D") is shown as that date once. Other text is shown as it is.
 */
export function dateOnly(text: string): string {
  const s = text.replace(TIMESTAMP, "$1");
  const range = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(s);
  return range && range[1] === range[2] ? range[1]! : s;
}
