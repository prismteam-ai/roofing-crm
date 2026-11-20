/**
 * Local lane: deleting a lead asks in the page first (the browser's own confirm dialog may be blocked). Against the
 * built app on 127.0.0.1 with the stubs in stubs.ts: the lead and its delete are local stubs, so no hosted lead is
 * read, changed or deleted.
 */
import { expect, test } from "@playwright/test";
import { LAYOUT_BREAKPOINTS, openLayout } from "../layout-checks.ts";
import { ids, TS, useLocalStubs } from "./stubs.ts";

const stubs = useLocalStubs();
const PARCEL = ids[0]!;
const ASK = "Delete the lead for this parcel? This cannot be undone.";

test("lead delete (local): Delete asks in the page first: Cancel leaves the lead and sends nothing; 'Delete lead' deletes it", async ({
  page,
}) => {
  let stored = true;
  stubs.answer("leads.get", ({ parcel_id }) =>
    stored && parcel_id === PARCEL
      ? {
          parcel_id,
          status: "contacted",
          notes: "",
          created_at: TS,
          updated_at: TS,
        }
      : null,
  );
  stubs.answer("leads.delete", ({ parcel_id }) => {
    stored = false;
    return { parcel_id, deleted: true };
  });
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.type());
    void d.dismiss();
  });
  const deletes = () => stubs.calls.filter((c) => c.proc === "leads.delete");

  await openLayout(page, LAYOUT_BREAKPOINTS[0]!);
  await page
    .getByTestId("lead-item")
    .filter({ hasText: PARCEL })
    .first()
    .click();
  await expect(page.getByTestId("lead")).toHaveAttribute("data-parcel", PARCEL);
  await expect(page.getByTestId("lead-status")).toHaveValue("contacted");

  // Delete only asks.
  await page.getByTestId("lead-delete").click();
  const ask = page.getByTestId("lead-delete-confirmation");
  await expect(ask).toContainText(ASK);
  await expect(page.getByTestId("lead-delete-confirm")).toHaveText(
    "Delete lead",
  );
  await expect(page.getByTestId("lead-delete-cancel")).toBeFocused();
  expect(deletes()).toEqual([]);

  // Cancel: the question goes, the lead stays in the editor and the list, nothing is sent.
  await page.getByTestId("lead-delete-cancel").click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByTestId("lead-save")).toBeVisible();
  await expect(page.getByTestId("lead-status")).toHaveValue("contacted");
  await expect(
    page.getByTestId("lead-item").filter({ hasText: PARCEL }),
  ).toHaveCount(1);
  expect(deletes()).toEqual([]);
  expect(stored).toBe(true);

  // Delete, then 'Delete lead': one delete with the lead's timestamp; the editor offers Create again.
  await page.getByTestId("lead-delete").click();
  await page.getByTestId("lead-delete-confirm").click();
  await expect(page.getByTestId("lead-create")).toBeVisible();
  await expect(ask).toHaveCount(0);
  await expect(
    page.getByTestId("lead-item").filter({ hasText: PARCEL }),
  ).toHaveCount(0);
  expect(deletes()).toEqual([
    {
      proc: "leads.delete",
      input: { parcel_id: PARCEL, expected_updated_at: TS },
    },
  ]);
  expect(stored).toBe(false);
  // The browser's own dialog is never opened.
  expect(dialogs).toEqual([]);
});
