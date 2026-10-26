// B-09 review finding 11 (CR-B-09, alakazam; ADR-06 §5 "every number = a computed count?"): the
// deterministic claim-text check that runs after the citation-id check. No model call.
//
// Rules, in order:
//  1. Identifiers. Any CID-shaped token (`baf…`), and any TCAD id / permit number / CID from this
//     turn's evidence, that the claim names must belong to one of the claim's own cited rows.
//  2. Numbers. With the cited identifiers removed, every remaining number in the text must equal
//     a value from the cited rows, a server-computed count/plan value, or the number of rows the
//     claim cites. Formatting variants are accepted: sign, thousands separators, rounding to the
//     precision the claim wrote ("30.41" for 30.4118), and a whole number that is the floor of a
//     fractional value ("about 3 years" for 3.38 years).
//
// Known limits (kept simple on purpose): numbers written as words ("fifteen") are not checked,
// and a digit inside a word ("ZCTA5") is not read as a number.

export interface ClaimTextFacts {
  /** Numeric values carried by the claim's cited rows (roof age, open days/years, coordinates,
   *  date parts, run counts). */
  readonly citedNumbers: readonly number[];
  /** TCAD ids, permit numbers and CIDs of the claim's cited rows. */
  readonly citedIdentifiers: readonly string[];
  /** Every identifier this turn's evidence carries (cited or not). */
  readonly turnIdentifiers: readonly string[];
  /** Server-computed counts and the validated plan's own numbers (radius, thresholds, centre). */
  readonly allowedNumbers: readonly number[];
  /** How many distinct rows the claim cites ("these 2 properties"). */
  readonly citedRowCount?: number;
}

export type ClaimTextResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const CID_TOKEN = /\bbaf[a-z2-7]{20,}\b/gi;
// A number not glued to a preceding letter/digit/dot: "1,234", "30.41", "15" (in "15th" too).
const NUMBER_TOKEN = /(?<![A-Za-z0-9_.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token occurrences of `id` in `text` (case-insensitive), so "R-0001" never matches
 *  inside "R-00012". */
function tokenPattern(id: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(id)}(?![A-Za-z0-9])`, "gi");
}

function numberMatches(written: number, decimals: number, value: number): boolean {
  const v = Math.abs(value);
  const factor = 10 ** decimals;
  if (Math.abs(Math.round(v * factor) / factor - written) < 1e-9) return true;
  return decimals === 0 && Math.floor(v) === written;
}

export function checkClaimText(text: string, facts: ClaimTextFacts): ClaimTextResult {
  const cited = facts.citedIdentifiers.filter((id) => id.length > 0);
  const citedLower = new Set(cited.map((id) => id.toLowerCase()));

  // Rule 1a: an identifier from this turn that the claim names but does not cite.
  for (const id of facts.turnIdentifiers) {
    if (id.length === 0 || citedLower.has(id.toLowerCase())) continue;
    if (tokenPattern(id).test(text)) return { ok: false, reason: `names uncited ${id}` };
  }

  // Remove cited identifiers (longest first) so their digits aren't read as stated numbers.
  let rest = text;
  for (const id of [...cited].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(tokenPattern(id), " ");
  }

  // Rule 1b: any CID-shaped token left is not one of the cited rows'.
  const strayCid = rest.match(CID_TOKEN);
  if (strayCid !== null) return { ok: false, reason: `names uncited ${strayCid[0]}` };

  // Rule 2: every number left must be a known value.
  const allowed = [
    ...facts.citedNumbers,
    ...facts.allowedNumbers,
    ...(facts.citedRowCount === undefined ? [] : [facts.citedRowCount]),
  ];
  for (const match of rest.matchAll(NUMBER_TOKEN)) {
    const whole = (match[1] ?? "").replace(/,/g, "");
    const fraction = match[2] ?? "";
    const written = Number(fraction === "" ? whole : `${whole}.${fraction}`);
    if (!allowed.some((value) => numberMatches(written, fraction.length, value))) {
      return { ok: false, reason: `states ${match[0]}, not in its cited rows or the counts` };
    }
  }
  return { ok: true };
}
