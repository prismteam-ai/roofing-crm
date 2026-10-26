// B-09 GAP-2: deterministic place recognition for the agent's plan step. The plan model reads the
// language but sometimes returns an unusable area (the whole sentence, an empty query, a reply
// wrapped in prose or a code fence). This module finds the place the rep actually typed by
// scanning the question for names from the bundled gazetteer (travis-places@1.0.0), so the server
// can repair the plan's area from what was typed. It never invents a place: only an exact
// gazetteer name or a Travis ZCTA code can match, and a name qualified by a direction or a
// neighbourhood word ("downtown Austin", "north Austin") is NOT a match, because the gazetteer
// holds city-level centroids only and the honest answer to those is a clarification.
import { gazetteer } from "@crm/oracle-views";

export interface AreaMatch {
  readonly kind: "place" | "zip";
  /** What goes into plan.area.query: a bare place name, or the 5-digit ZIP. */
  readonly query: string;
}

export interface RadiusMatch {
  readonly radiusMi: number;
}

/** Words that narrow a place below what the gazetteer can locate. */
const NARROWING = new Set([
  "downtown",
  "uptown",
  "midtown",
  "north",
  "south",
  "east",
  "west",
  "northeast",
  "northwest",
  "southeast",
  "southwest",
  "central",
  "old",
  "greater",
  "outer",
  "inner",
  "lower",
  "upper",
]);

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  "twenty-five": 25,
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cachedNames: { readonly name: string; readonly pattern: RegExp }[] | undefined;

/** Bare place names, longest first so "Bee Cave" wins over a shorter name inside it. */
function placePatterns(): { readonly name: string; readonly pattern: RegExp }[] {
  if (cachedNames === undefined) {
    cachedNames = [...new Set(gazetteer.listPlaceNames())]
      .sort((a, b) => b.length - a.length)
      .map((name) => ({
        name,
        // Word boundaries on both sides; spaces inside a name match any run of whitespace.
        pattern: new RegExp(
          `(?<![\\p{L}\\p{N}])${escapeRegExp(name).replace(/\\? /g, "\\s+")}(?![\\p{L}\\p{N}])`,
          "iu",
        ),
      }));
  }
  return cachedNames;
}

/** The word right before `index` in `text`, lower-cased ("" when none). */
function wordBefore(text: string, index: number): string {
  const match = /([\p{L}-]+)\s*$/u.exec(text.slice(0, index));
  return match?.[1]?.toLowerCase() ?? "";
}

/**
 * A 5-digit ZIP: "ZIP 78701", "zip code 78701", or a bare code that is a Travis ZCTA. A code the
 * gazetteer does not hold is returned too when it follows the word "zip" (so the scope gate can
 * refuse it as out of scope, the way "ZIP 99999" is refused); a bare unknown number is not a ZIP.
 */
function findZip(question: string): AreaMatch | undefined {
  const labelled = /\bzip(?:\s*code)?\s*[:#]?\s*(\d{5})(?!\d)/i.exec(question);
  if (labelled?.[1] !== undefined) return { kind: "zip", query: labelled[1] };
  for (const m of question.matchAll(/(?<![\d.])(\d{5})(?![\d.]|\s*(?:years?|yrs?|mi\b|miles?))/g)) {
    const code = m[1];
    if (code !== undefined && gazetteer.lookup(code).status === "found") {
      return { kind: "zip", query: code };
    }
  }
  return undefined;
}

/**
 * The place or ZIP the question names, or undefined. A ZIP wins over a place name (it is exact).
 * When several places appear, the one named after "of", "near", "around", "in" or "from" wins
 * ("within 5 miles of Manor"); otherwise the first in the text.
 */
export function scanQuestionForArea(question: string): AreaMatch | undefined {
  const zip = findZip(question);
  if (zip !== undefined) return zip;

  const hits: { index: number; name: string; anchored: boolean }[] = [];
  const taken: [number, number][] = [];
  for (const { name, pattern } of placePatterns()) {
    const m = pattern.exec(question);
    if (m === null) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (taken.some(([s, e]) => start < e && end > s)) continue; // inside a longer name
    if (NARROWING.has(wordBefore(question, start))) continue; // "downtown Austin" is not Austin
    taken.push([start, end]);
    const before = wordBefore(question, start);
    hits.push({
      index: start,
      name,
      anchored: ["of", "near", "around", "in", "from"].includes(before),
    });
  }
  if (hits.length === 0) return undefined;
  hits.sort((a, b) => Number(b.anchored) - Number(a.anchored) || a.index - b.index);
  const best = hits[0];
  return best === undefined ? undefined : { kind: "place", query: best.name };
}

/** "within five miles", "5 mile radius", "10 mi": the radius the rep stated, 0.5 to 25 only. */
export function scanQuestionForRadius(question: string): RadiusMatch | undefined {
  const word = Object.keys(NUMBER_WORDS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const m = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${word})[\\s-]*(?:mi\\b|miles?\\b)`, "i").exec(
    question,
  );
  if (m?.[1] === undefined) return undefined;
  const raw = m[1].toLowerCase();
  const value = NUMBER_WORDS[raw] ?? Number(raw);
  if (!Number.isFinite(value) || value < 0.5 || value > 25) return undefined;
  return { radiusMi: value };
}

/**
 * Pulls a JSON object out of a model reply that was meant to be bare JSON: strips a markdown
 * fence, or takes the text from the first "{" to the last "}". Returns the original text when
 * there is no object to take.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1] !== undefined) return fenced[1];
  if (trimmed.startsWith("{")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return first >= 0 && last > first ? trimmed.slice(first, last + 1) : trimmed;
}

/** Longest place name in the gazetteer, so "too long to be a place" has a principled bound. */
export function longestPlaceNameLength(): number {
  return Math.max(...gazetteer.listPlaceNames().map((n) => n.length), 0);
}

/**
 * "downtown Austin", "north Austin": a narrowing word plus a gazetteer place. The gazetteer cannot
 * locate the narrower area, so the scope gate asks the rep to confirm the whole place instead of
 * guessing a centre. Returns the bare place name, or undefined.
 */
export function narrowedPlace(query: string): string | undefined {
  const words = query.trim().split(/\s+/);
  let i = 0;
  while (i < words.length && NARROWING.has((words[i] ?? "").toLowerCase())) i += 1;
  if (i === 0 || i >= words.length) return undefined;
  const rest = words.slice(i).join(" ");
  const found = gazetteer.lookup(rest);
  if (found.status !== "found" || found.kind !== "place") return undefined;
  return gazetteer.listPlaceNames().find((n) => n.toLowerCase() === rest.toLowerCase());
}

/** Cities outside Travis County that reps ask about in lower case or without a capital; a name
 *  here is always a named place, never a stray word after "near". */
const KNOWN_OUTSIDE = [
  "houston",
  "dallas",
  "san antonio",
  "fort worth",
  "el paso",
  "corpus christi",
  "waco",
  "san marcos",
  "new braunfels",
  "georgetown",
  "killeen",
  "temple",
];

const NOT_A_PLACE = new Set([
  "travis",
  "texas",
  "tx",
  "county",
  "the",
  "a",
  "an",
  "my",
  "our",
  "here",
  "there",
  "this",
  "that",
  "me",
  "us",
  "town",
  "city",
  "total",
  "general",
]);

const OWNER_CONTEXT = /\b(?:owners?|owned|live[sd]?|living|resid\w*|mailing|based|moved)\b[^.?]*$/i;

/**
 * The place the rep typed after a distance or proximity cue ("within 5 miles of Houston", "near
 * Dallas", "roofs in San Antonio"), whether or not the gazetteer holds it. The gate uses it to
 * notice an area the plan swapped for another place. Owner phrasing ("owners who live in Dallas")
 * is skipped: that names where an owner lives, not the search area. Undefined when no place is
 * named, so a question without one keeps its existing default behaviour.
 */
export function scanQuestionForNamedPlace(question: string): string | undefined {
  const cue =
    /(?:\b(?:mi|miles?|km)\s+(?:of|from|around|outside(?:\s+of)?)|\b(?:near|around|outside(?:\s+of)?|in|from|of))\s+/gi;
  for (const m of question.matchAll(cue)) {
    const rest = question.slice(m.index + m[0].length);
    // Only the weak cues can mean where an owner lives; "near" and "miles of" name the search area.
    const weak = /^(?:in|from|of)\s/i.test(m[0]);
    if (weak && OWNER_CONTEXT.test(question.slice(0, m.index))) continue;
    const lower = rest.toLowerCase();
    const outside = KNOWN_OUTSIDE.find((c) => new RegExp(`^${c}(?![\\p{L}])`, "u").test(lower));
    if (outside !== undefined) {
      return rest.slice(0, outside.length).replace(/\b\w/g, (c) => c.toUpperCase());
    }
    const words = /^([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,2})/.exec(rest)?.[1];
    if (words === undefined) continue;
    const kept: string[] = [];
    for (const w of words.split(/\s+/)) {
      if (NOT_A_PLACE.has(w.toLowerCase().replace(/[.']/g, ""))) break;
      kept.push(w);
    }
    if (kept.length > 0) return kept.join(" ");
  }
  return undefined;
}
