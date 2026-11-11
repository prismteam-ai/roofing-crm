import { DEFAULTS } from '@roofing/shared';
import { GAZETTEER } from './geocode.js';

export interface ParsedQuestion {
  radiusMiles: number | null;
  minOpenYears: number | null;
  minRoofAge: number | null;
  openPermits: boolean;
  place: string | null;
}

const WORDS: Record<string, number> = {
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
};
const num = (s: string | undefined) =>
  s === undefined ? null : (WORDS[s.toLowerCase()] ?? Number(s));

/** Cheap, deterministic parse of a natural-language lead query (offline mode + tool-call defaults). */
export function parseQuestion(q: string): ParsedQuestion {
  const text = q.toLowerCase();
  const n = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)';
  const radius =
    text.match(new RegExp(`within ${n}\\s*(?:mi|mile|miles)`)) ??
    text.match(new RegExp(`${n}[- ]?(?:mi|mile|miles)`));
  const openPermits = /permit/.test(text);
  const years =
    text.match(new RegExp(`(?:older|more|longer|open)[^.]{0,20}?than ${n}\\s*(?:years?|yrs?)`)) ??
    text.match(new RegExp(`${n}\\+?\\s*(?:years?|yrs?)`));
  const yearsVal = num(years?.[1]);
  const roofMention =
    /roof(?!ing permit)/.test(text) && !/permit/.test(text.slice(0, text.indexOf('roof') + 40));
  const place =
    text
      .match(
        /(?:within [^ ]+ (?:mi|mile|miles) of|near|around|in|of)\s+([a-z][a-z .']{2,40}?)(?:[?,.!]|$| with| that| and| older| which| having)/,
      )?.[1]
      ?.trim() ?? null;
  const known = place && Object.keys(GAZETTEER).find((k) => place.includes(k));
  return {
    radiusMiles: num(radius?.[1]),
    minOpenYears: openPermits ? yearsVal : null,
    minRoofAge: !openPermits || roofMention ? yearsVal : null,
    openPermits,
    place: known ?? place,
  };
}

export const applyDefaults = (p: ParsedQuestion) => ({
  radiusMiles: p.radiusMiles ?? DEFAULTS.radiusMiles,
  minOpenYears: p.openPermits ? (p.minOpenYears ?? DEFAULTS.minOpenYears) : undefined,
  minRoofAge: p.openPermits ? undefined : (p.minRoofAge ?? DEFAULTS.minRoofAge),
});
