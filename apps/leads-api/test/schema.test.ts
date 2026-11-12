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
