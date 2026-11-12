/**
 * Lead contract shared by the leads API and the CRM app (browser-safe: Zod only, no server imports).
 * A lead holds the parcel ID, status, notes and timestamps only: no owner names, mailing addresses or
 * contact fields.
 */
import { z } from "zod";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
] as const;
export const NOTES_MAX = 1000;

/** An email address anywhere in the text. */
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/**
 * An ISO date (YYYY-MM-DD, month 01-12, day 01-31) that is not part of a longer digit run, with the
 * character before it captured. A capture rather than a lookbehind, so older Safari can parse it.
 */
const ISO_DATE = /(^|\D)\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?!\d)/g;
/** Digits joined only by separators: whitespace . - ( ) +, as in "(818) 555-1234" or "+1 818 555 1234". */
const DIGIT_RUN = /\d(?:[\s.\-()+]*\d)*/g;
/** A run with this many digits or more is phone-like. This also catches a 10-digit parcel ID, by design. */
const PHONE_LIKE_DIGITS = 7;

/** True when the text holds a phone-like digit run. ISO dates are taken out first, so they stay allowed. */
function hasPhoneLikeRun(notes: string): boolean {
  const runs = notes.replace(ISO_DATE, "$1#").match(DIGIT_RUN) ?? [];
  return runs.some((run) => run.replace(/\D/g, "").length >= PHONE_LIKE_DIGITS);
}

export const NOTES_REJECTED_MESSAGE =
  "Notes must not contain an email address or 7 or more digits in a row (phone-like numbers). " +
  "This also rejects a 10-digit parcel ID; the lead already records its parcel.";

/** Why a notes text is rejected, or undefined when it is allowed. */
export function notesProblem(notes: string): string | undefined {
  if (notes.length > NOTES_MAX)
    return `Notes are limited to ${NOTES_MAX} characters.`;
  if (EMAIL.test(notes) || hasPhoneLikeRun(notes))
    return NOTES_REJECTED_MESSAGE;
  return undefined;
}

export const parcelId = z.string().regex(/^\d{10}$/, "parcel_id is 10 digits");
export const status = z.enum(LEAD_STATUSES);
export const notes = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    const problem = notesProblem(v);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });
/** ISO 8601 UTC timestamp as written by the server. */
export const timestamp = z.iso.datetime();

export const lead = z.object({
  parcel_id: parcelId,
  status,
  notes,
  created_at: timestamp,
  updated_at: timestamp,
});
export type Lead = z.infer<typeof lead>;
export type LeadStatus = z.infer<typeof status>;

export const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(100),
  cursor: parcelId.optional(),
});
export const getInput = z.object({ parcel_id: parcelId });
export const createInput = z.object({
  parcel_id: parcelId,
  status: status.default("new"),
  notes: notes.default(""),
});
export const updateInput = z
  .object({
    parcel_id: parcelId,
    expected_updated_at: timestamp,
    status: status.optional(),
    notes: notes.optional(),
  })
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: "nothing to update",
  });
export const deleteInput = z.object({
  parcel_id: parcelId,
  expected_updated_at: timestamp,
});

export interface LeadList {
  items: Lead[];
  next_cursor: string | null;
}
