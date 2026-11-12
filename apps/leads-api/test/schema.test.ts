import { expect, test } from "vitest";
import {
  createInput,
  NOTES_REJECTED_MESSAGE,
  notesProblem,
  updateInput,
} from "../src/schema.ts";

test("notes: plain text up to 1,000 characters is allowed", () => {
  expect(
    notesProblem("Roof looks original; call back after the rain."),
  ).toBeUndefined();
  expect(
    notesProblem("Visited 3 times, 2 storeys, built 1962."),
  ).toBeUndefined();
  expect(notesProblem("x".repeat(1000))).toBeUndefined();
  expect(notesProblem("x".repeat(1001))).toMatch(/1000 characters/);
});

test("notes: an email address or 7+ digits in a row is rejected", () => {
  expect(notesProblem("write to someone@example.com")).toBe(
    NOTES_REJECTED_MESSAGE,
  );
  expect(notesProblem("call 8185551234")).toBe(NOTES_REJECTED_MESSAGE);
  expect(notesProblem("call 5551234")).toBe(NOTES_REJECTED_MESSAGE);
});

test("notes: formatted phone numbers are rejected", () => {
  for (const phone of [
    "(818) 555-1234",
    "818-555-1234",
    "818.555.1234",
    "+1 818 555 1234",
    "8185551234",
  ])
    expect(notesProblem(`call ${phone} after 5`), phone).toBe(
      NOTES_REJECTED_MESSAGE,
    );
});

test("notes: ISO dates and short numbers in prose are allowed", () => {
  for (const text of [
    "roof looks old",
    "replaced 2026-11-12",
    "2 skylights, 3 vents",
    // Two dates side by side: each is taken out on its own, so they do not join into one run.
    "inspected 2026-11-12 2026-11-14",
    // A date with a time: only the date part is a long digit run.
    "visited 2026-11-12T10:30",
    // Six digits joined by separators: one short of the phone-like rule.
    "lot 12-34-56",
  ])
    expect(notesProblem(text), text).toBeUndefined();
});

test("notes: edge cases of the phone-like rule", () => {
  for (const text of [
    // A 7-digit local number, the shortest phone the rule is for.
    "call 555 1234",
    // The parcel ID as printed with dashes (4-3-3) is still 10 digits.
    "same owner as 2317-016-013",
    // A date next to a phone number does not hide the phone number.
    "2026-11-12 818 555 1234",
    // A line break is whitespace, so it does not split a phone number.
    "call 818\n555 1234",
    // Only a real YYYY-MM-DD shape is a date; month 55 is not.
    "call 8185-55-1234",
    // A hyphenated year range is one 8-digit run; "1962 to 1975" is the way to write it.
    "additions 1962-1975",
  ])
    expect(notesProblem(text), text).toBe(NOTES_REJECTED_MESSAGE);
  expect(notesProblem("additions 1962 to 1975")).toBeUndefined();
});

test("notes: a 10-digit parcel ID is rejected too, and the message says so", () => {
  expect(notesProblem("same owner as 2317016013")).toBe(NOTES_REJECTED_MESSAGE);
  expect(NOTES_REJECTED_MESSAGE).toMatch(/10-digit parcel ID/);
  const r = createInput.safeParse({
    parcel_id: "2317016013",
    notes: "see 2319005018",
  });
  expect(r.success).toBe(false);
  expect(r.error?.issues[0]?.message).toBe(NOTES_REJECTED_MESSAGE);
});

test("create defaults to status new and empty notes; parcel IDs are 10 digits", () => {
  expect(createInput.parse({ parcel_id: "2317016013" })).toEqual({
    parcel_id: "2317016013",
    status: "new",
    notes: "",
  });
  expect(createInput.safeParse({ parcel_id: "231701601" }).success).toBe(false);
  expect(
    createInput.safeParse({ parcel_id: "2317016013", status: "open" }).success,
  ).toBe(false);
});

test("update needs the last-seen timestamp and something to change", () => {
  const at = "2026-11-12T10:00:00.000Z";
  expect(
    updateInput.safeParse({ parcel_id: "2317016013", expected_updated_at: at })
      .success,
  ).toBe(false);
  expect(
    updateInput.safeParse({
      parcel_id: "2317016013",
      expected_updated_at: at,
      status: "won",
    }).success,
  ).toBe(true);
});
