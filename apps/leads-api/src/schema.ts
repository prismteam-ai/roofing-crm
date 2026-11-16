/**
 * Lead contract shared by the leads API and the CRM app (browser-safe: Zod only, no server imports).
 * A lead holds the parcel ID, status, notes and timestamps, and the permit it was created from when it was
 * created from one: no owner names, mailing addresses or contact fields.
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
/** 7 or more digits in a row. This also refuses a 10-digit parcel ID, on purpose, and the error message says so. */
const DIGITS_7 = /\d{7,}/;
/**
 * A full phone number (NANP) with its area code: an optional +1 or 1, the area code in brackets or not,
 * a 3-digit exchange and a 4-digit line. The groups are separated by whitespace, dots or hyphens; only a
 * bracketed area code may run straight into the exchange. E.g. "(818) 555-1234", "(818)555-1234",
 * "818.555.1234", "+1 818 555 1234". The separator before the line is required: unseparated digits are
 * DIGITS_7's. A local number without an area code ("555-1234") is not matched. Not part of a longer digit
 * run on either side. "(^|\D)" rather than a lookbehind, so older Safari can parse it.
 */
const PHONE =
  /(?:^|\D)(?:\+?1[\s.-]?)?(?:\(\d{3}\)[\s.-]?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?!\d)/;

export const NOTES_REJECTED_MESSAGE =
  "Notes must not contain email addresses, phone numbers with an area code (with or without brackets, " +
  "spaces, dots or hyphens) or 7 or more digits in a row. That also refuses a 10-digit parcel ID; the lead already " +
  "records its parcel.";

/** Why a notes text is rejected, or undefined when it is allowed. */
export function notesProblem(notes: string): string | undefined {
  if (notes.length > NOTES_MAX)
    return `Notes are limited to ${NOTES_MAX} characters.`;
  if (EMAIL.test(notes) || PHONE.test(notes) || DIGITS_7.test(notes))
    return NOTES_REJECTED_MESSAGE;
  return undefined;
}

export const parcelId = z.string().regex(/^\d{10}$/, "parcel_id is 10 digits");
/** A permit number in the one shape every permit of the served run has: 99999-99999-99999 (17 characters). */
export const permitNumber = z
  .string()
  .regex(/^\d{5}-\d{5}-\d{5}$/, "a permit number is 99999-99999-99999");
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
  /**
   * The permit the lead was created from (a permit row in the CRM). Set only at creation, never updated; absent
   * on a lead created any other way and on leads stored before it existed.
   */
  source_permit: permitNumber.optional(),
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
  /** Sent only when the lead is created from a permit; stored as it is. */
  source_permit: permitNumber.optional(),
});
/** No source_permit here: it is set at creation and never changed (an extra key is dropped, as any other). */
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
