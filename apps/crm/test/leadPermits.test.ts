/** The permit-status filter's rule (src/leadPermits.ts), without the screen. */
import { expect, test } from "vitest";
import type { ParcelPermits } from "@oracle-la/api-client";
import {
  PERMIT_CHOICES,
  passesPermitChoice,
  permitKey,
  permitReadText,
  statusOfPermit,
  type PermitChoice,
  type PermitRead,
} from "../src/leadPermits.ts";

const WITH = { parcel_id: "0000000001", source_permit: "16016-10000-00001" };
const WITHOUT = { parcel_id: "0000000002" };
const reads = (r?: PermitRead) =>
  new Map<string, PermitRead>(r ? [[permitKey(WITH), r]] : []);
const STATUS_CHOICES: PermitChoice[] = [
  "open-issued",
  "open-application",
  "closed",
  "unclear",
];

test("the choices and their screen texts, in order", () => {
  expect(PERMIT_CHOICES).toEqual([
    { value: "all", text: "all permit statuses" },
    { value: "open-issued", text: "Open (issued)" },
    { value: "open-application", text: "Open (application stage)" },
    { value: "closed", text: "Closed" },
    { value: "unclear", text: "Unclear (neither open nor closed)" },
    { value: "none", text: "no permit on the lead" },
  ]);
});

test("a lead with a read permit passes its own class only; 'all' passes every lead", () => {
  for (const c of STATUS_CHOICES)
    for (const choice of STATUS_CHOICES)
      expect(passesPermitChoice(WITH, choice, reads(c as PermitRead))).toBe(
        c === choice,
      );
  expect(passesPermitChoice(WITH, "none", reads("closed"))).toBe(false);
  expect(passesPermitChoice(WITH, "all", reads())).toBe(true);
  expect(passesPermitChoice(WITHOUT, "all", reads())).toBe(true);
  // "unmapped" is read but no choice: it passes none of the status choices.
  for (const choice of STATUS_CHOICES)
    expect(passesPermitChoice(WITH, choice, reads("unmapped"))).toBe(false);
});

test("a lead without a permit passes 'no permit on the lead' only, without a read", () => {
  expect(passesPermitChoice(WITHOUT, "none", reads())).toBe(true);
  for (const choice of STATUS_CHOICES)
    expect(passesPermitChoice(WITHOUT, choice, reads())).toBe(false);
});

test("not read yet: undefined (the list waits); unreadable: kept under every status choice", () => {
  for (const choice of STATUS_CHOICES) {
    expect(passesPermitChoice(WITH, choice, reads())).toBeUndefined();
    expect(passesPermitChoice(WITH, choice, reads("unavailable"))).toBe(true);
  }
  expect(passesPermitChoice(WITH, "none", reads("unavailable"))).toBe(false);
  expect(permitReadText("unavailable")).toBe("status not available");
  expect(permitReadText("open-application")).toBe("Open (application stage)");
});

test("the lead's permit is picked out of its parcel's permits by number; absent: null", () => {
  const permit = (permit_number: string, permit_status_class: string) =>
    ({ permit_number, permit_status_class }) as ParcelPermits["permits"][0];
  const data = {
    permits: [
      permit("16016-10000-00009", "open-issued"),
      permit(WITH.source_permit, "closed"),
    ],
  } as ParcelPermits;
  expect(statusOfPermit(data, WITH.source_permit)).toBe("closed");
  expect(statusOfPermit(data, "16016-10000-00002")).toBeNull();
  expect(
    statusOfPermit({ ...data, permits: [] }, WITH.source_permit),
  ).toBeNull();
});
