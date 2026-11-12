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
/** 7 or more digits in a row (phone-like). This also matches a 10-digit parcel ID, by design. */
const DIGITS_7 = /\d{7,}/;

export const NOTES_REJECTED_MESSAGE =
  "Notes must not contain an email address or 7 or more digits in a row (phone-like numbers). " +
  "This also rejects a 10-digit parcel ID; the lead already records its parcel.";

/** Why a notes text is rejected, or undefined when it is allowed. */
export function notesProblem(notes: string): string | undefined {
  if (notes.length > NOTES_MAX)
    return `Notes are limited to ${NOTES_MAX} characters.`;
  if (EMAIL.test(notes) || DIGITS_7.test(notes)) return NOTES_REJECTED_MESSAGE;
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
