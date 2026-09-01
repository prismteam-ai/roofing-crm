/**
 * Deterministic NL intent parsing for the agent's no-key mode.
 *
 * This is not a toy pattern-matcher standing in for "real" AI -- it is the
 * genuine query path: it extracts a structured intent from a question like
 * the README's own example ("open roofing permits older than five years
 * within five miles of Merritt Island"), and the caller runs that intent
 * through the same DuckDB radius/permit queries the map itself uses. The
 * agent answers with real rows either way; an LLM (when available) only
 * helps with phrasing and with parsing questions this parser cannot.
 */

export interface QueryIntent {
  /** Matched verbatim from the caller's known-places list, or null if none mentioned. */
  place: string | null;
  radiusMiles: number | null;
  /** "roofs older than N years" -- a building-age/roof-age threshold. Null unless asked. */
  roofAgeThresholdYears: number | null;
  /** True when the question is about permits being open, not roof age. */
  wantsOpenPermits: boolean;
  /**
   * "open more than N years" / "stalled" -- how long a permit has sat open.
   * Distinct from roofAgeThresholdYears: "permits older than five years"
   * means the permit itself has been open five years, not the roof.
   */
  minOpenYears: number | null;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

/** Accepts digits ("15") or words ("fifteen", "twenty five"), since the README's own example uses words. */
function wordsToNumber(text: string): number | null {
  const digitMatch = /\d+(\.\d+)?/.exec(text);
  if (digitMatch) return Number(digitMatch[0]);
  const parts = text.toLowerCase().trim().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [first, second] = parts;
  const firstValue = first ? NUMBER_WORDS[first] : undefined;
  if (parts.length >= 2 && second && firstValue !== undefined && firstValue >= 20 && firstValue % 10 === 0) {
    const secondValue = NUMBER_WORDS[second];
    if (secondValue !== undefined) return firstValue + secondValue;
  }
  return firstValue ?? null;
}

const NUMBER_PHRASE = '[a-z0-9][a-z0-9.\\- ]*?';

export function parseIntent(question: string, knownPlaces: readonly string[]): QueryIntent {
  const q = question.toLowerCase();

  let radiusMiles: number | null = null;
  const radiusMatch = new RegExp(`within\\s+(${NUMBER_PHRASE})\\s*mi(?:le|les)?\\b`).exec(q);
  if (radiusMatch?.[1]) radiusMiles = wordsToNumber(radiusMatch[1]);

  let yearsValue: number | null = null;
  const ageMatch = new RegExp(`(?:older than|over|more than)\\s+(${NUMBER_PHRASE})\\s*years?\\b`).exec(q);
  if (ageMatch?.[1]) yearsValue = wordsToNumber(ageMatch[1]);

  const mentionsPermit = /\bpermits?\b/.test(q);
  const mentionsOpenOrStalled = /\bopen\b/.test(q) || /\bstalled\b/.test(q);
  const wantsOpenPermits = mentionsPermit && mentionsOpenOrStalled;

  let minOpenYears: number | null = null;
  if (/\bstalled\b/.test(q)) minOpenYears = 5; // project convention: stalled = open > 5 years
  else if (wantsOpenPermits && yearsValue !== null) minOpenYears = yearsValue;

  let place: string | null = null;
  let bestLen = 0;
  for (const p of knownPlaces) {
    if (p.length > bestLen && q.includes(p.toLowerCase())) { place = p; bestLen = p.length; }
  }

  return {
    place,
    radiusMiles,
    roofAgeThresholdYears: wantsOpenPermits ? null : yearsValue,
    wantsOpenPermits,
    minOpenYears,
  };
}
