import { expect, test } from "vitest";
import {
  createInput,
  lead,
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

test("notes: phone numbers are refused, formatted or not", () => {
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
  expect(notesProblem("write to someone@example.com")).toBe(
    NOTES_REJECTED_MESSAGE,
  );
});

test("notes: amounts, year ranges, dates and short numbers in prose are allowed", () => {
  for (const text of [
    "roof looks old",
    "replaced 2026-11-12",
    "2 skylights, 3 vents",
    "quote $12,500.00",
    "quote 12500.00",
    "additions 1962-1975",
    // Two dates side by side, and a date with a time.
    "inspected 2026-11-12 2026-11-14",
    "visited 2026-11-12T10:30",
    "lot 12-34-56",
  ])
    expect(notesProblem(text), text).toBeUndefined();
});

test("notes: edge cases of the phone-shape rule", () => {
  for (const text of [
    // Brackets without a space, the 1- prefix, and +1 with hyphens.
    "call (818)555-1234",
    "call 1-818-555-1234",
    "call +1-818-555-1234",
    // A date next to a phone number does not hide the phone number.
    "2026-11-12 818 555 1234",
    // A local number without a separator is 7 digits in a row.
    "call 5551234",
    // A line break is whitespace, so it does not split a phone number.
    "call 818\n555 1234",
  ])
    expect(notesProblem(text), text).toBe(NOTES_REJECTED_MESSAGE);
});

test("notes: number pairs that are not full phone numbers are allowed", () => {
  for (const text of [
    // A 7-digit local number with a separator: no area code, so not a full phone number.
    "call 555-1234",
    "call 555 1234",
    "lot 120-1500",
    "pages 100-1200",
    // The parcel ID as printed 4-3-3 is not a phone shape, and has no 7 digits in a row.
    "same owner as 2317-016-013",
  ])
    expect(notesProblem(text), text).toBeUndefined();
});

test("notes: the message names what is refused", () => {
  expect(NOTES_REJECTED_MESSAGE).toMatch(/email addresses/);
  expect(NOTES_REJECTED_MESSAGE).toMatch(
    /phone numbers with an area code \(with or without brackets, spaces, dots or hyphens\)/,
  );
  expect(NOTES_REJECTED_MESSAGE).toMatch(/7 or more digits in a row/);
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

test("source_permit: optional at creation, only the run's one permit shape (99999-99999-99999)", () => {
  expect(
    createInput.parse({
      parcel_id: "2317016013",
      source_permit: "16016-10000-24567",
    }),
  ).toEqual({
    parcel_id: "2317016013",
    status: "new",
    notes: "",
    source_permit: "16016-10000-24567",
  });
  // Absent unless sent: no key at all.
  expect(
    "source_permit" in createInput.parse({ parcel_id: "2317016013" }),
  ).toBe(false);
  for (const bad of [
    "",
    "16016-10000-2456",
    "16016-10000-245678",
    "1601610000-24567",
    "16016 10000 24567",
    "A6016-10000-24567",
    " 16016-10000-24567",
    "16016-10000-24567\n",
    "16016-10000-24567-1",
  ])
    expect(
      createInput.safeParse({ parcel_id: "2317016013", source_permit: bad })
        .success,
      JSON.stringify(bad),
    ).toBe(false);
  expect(
    createInput.safeParse({
      parcel_id: "2317016013",
      source_permit: 1601610000,
    }).success,
  ).toBe(false);
});

test("source_permit is never updated: the update input drops it; a stored lead reads with or without it", () => {
  const at = "2026-11-12T10:00:00.000Z";
  const u = updateInput.parse({
    parcel_id: "2317016013",
    expected_updated_at: at,
    status: "won",
    source_permit: "16016-10000-24567",
  });
  expect("source_permit" in u).toBe(false);
  // An old lead (stored before the field existed) reads unchanged.
  const old = {
    parcel_id: "2317016013",
    status: "new",
    notes: "",
    created_at: at,
    updated_at: at,
  };
  expect(lead.parse(old)).toEqual(old);
  expect(lead.parse({ ...old, source_permit: "16016-10000-24567" })).toEqual({
    ...old,
    source_permit: "16016-10000-24567",
  });
});
