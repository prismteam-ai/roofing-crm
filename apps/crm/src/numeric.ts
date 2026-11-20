/**
 * Number fields as plain text entries: a field's state is the text exactly as typed (it can be emptied and
 * retyped), and it is read when the search runs. A value that is empty or not a number in range gives a plain
 * message and nothing is sent: the search keeps its last valid value.
 */
import type { ChangeEvent } from "react";

/**
 * What a number input reports when the browser cannot read its text as a number (it then reports ""), so an
 * unreadable entry is told apart from an empty one. Never shown: the browser keeps showing what was typed.
 */
export const NOT_A_NUMBER = "\u0000not-a-number";
/** The text of a number input as typed (NOT_A_NUMBER when the browser cannot read it). */
export const typed = (e: ChangeEvent<HTMLInputElement>) =>
  e.target.validity?.badInput ? NOT_A_NUMBER : e.target.value;
/** The value given back to the input for a field's text. */
export const inputValue = (text: string) => (text === NOT_A_NUMBER ? "" : text);

export interface NumberRule {
  /** The field's label, as the page shows it. */
  label: string;
  min: number;
  max: number;
  /** Whole numbers only. */
  whole?: boolean;
}
export type Read<V> = { value: V } | { error: string };

/** Plain decimal notation only: no exponent, hex, Infinity or thousands separators. */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const fmt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 6 });
const range = (r: NumberRule) =>
  `${r.whole ? "a whole number" : "a number"} from ${fmt(r.min)} to ${fmt(r.max)}`;

/** A field's text as a number of the rule, or the message to show. */
export function readNumber(text: string, rule: NumberRule): Read<number> {
  const t = text.trim();
  if (t === "")
    return { error: `${rule.label} is empty: enter ${range(rule)}.` };
  const n = Number(t);
  if (
    text === NOT_A_NUMBER ||
    !DECIMAL.test(t) ||
    (rule.whole && !Number.isInteger(n)) ||
    n < rule.min ||
    n > rule.max
  )
    return { error: `${rule.label} must be ${range(rule)}.` };
  return { value: n };
}
/** An optional field: empty reads as undefined (not sent). */
export const readOptional = (
  text: string,
  rule: NumberRule,
): Read<number | undefined> =>
  text.trim() === "" && text !== NOT_A_NUMBER
    ? { value: undefined }
    : readNumber(text, rule);

/** The roof-age threshold the data API accepts. */
export const THRESHOLD: NumberRule = {
  label: "Roof older than (years)",
  min: 1,
  max: 120,
  whole: true,
};
