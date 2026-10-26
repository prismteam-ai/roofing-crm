// The List view (`view=list`, the Candidate list) at 390/768/1440, rendered on the hosted app:
// on a phone each row is a tappable card whose address wraps at word boundaries (never one
// character per line), with no sideways scroll; from 768 px it is a table with its column
// headers. Read-only: a fixture search, nothing is selected or created.
import { expect, test } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import {
  expectInsideViewport,
  expectNoHorizontalScroll,
  MIN_TAP,
  settledBox,
  viewportOf,
} from "../lib/layout.js";
import { LAYOUT_SEARCH_PATH } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

test.describe("Candidate list (List view) fits the screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await page.goto(`${LAYOUT_SEARCH_PATH}&view=list`);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await expect(page.locator("[data-candidate-row]").first()).toBeAttached({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
  });

  test("phone: addresses wrap at word boundaries, rows are tappable, no horizontal scroll; wider: a table with column headers", async ({
    page,
  }) => {
    const { width } = viewportOf(page);
    const table = page.getByRole("table", { name: "Candidates" });
    await expect(table).toBeVisible();
    await expectNoHorizontalScroll(page, "List view");

    if (width >= 768) {
      for (const name of ["Address", "Roof", "Conf."]) {
        await expect(
          table.getByRole("columnheader", { name, exact: true }),
          `column header ${name}`,
        ).toBeVisible();
      }
      const tableBox = await settledBox(table);
      expect(tableBox.x + tableBox.width, "table inside the screen").toBeLessThanOrEqual(width + 1);
      // The row actions are not pushed out of sight (the table fits the list area).
      const open = page
        .locator("[data-candidate-row]")
        .first()
        .getByRole("button", {
          name: /^Open details for /,
        });
      expectInsideViewport(await settledBox(open), page, "Open details action");
      return;
    }

    const rows = page.locator("[data-candidate-row]");
    const count = Math.min(await rows.count(), 6);
    expect(count, "rows are listed").toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      await row.scrollIntoViewIfNeeded();
      const rowBox = await settledBox(row);
      expect(
        rowBox.height,
        `row ${String(i + 1)} is at least ${String(MIN_TAP)} px tall`,
      ).toBeGreaterThanOrEqual(MIN_TAP);
      expect(rowBox.x + rowBox.width, `row ${String(i + 1)} inside the screen`).toBeLessThanOrEqual(
        width + 1,
      );
      // The address is the checkbox's own name ("Select <address>"), so find its text from that.
      const label = (await row.getByRole("checkbox").getAttribute("aria-label")) ?? "";
      const address = label.replace(/^Select /, "");
      const el = row.getByText(address, { exact: true }).first();
      const box = await settledBox(el);
      const lineHeight = await el.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight));
      expect(
        box.height,
        `row ${String(i + 1)} address "${address}" is at most 3 lines`,
      ).toBeLessThanOrEqual(lineHeight * 3 + 1);
      expect(box.width, `row ${String(i + 1)} address is wider than one character`).toBeGreaterThan(
        80,
      );
      // Word boundaries: no line break falls inside a word. Each word is measured on its own: a
      // word that wrapped mid-way spans two lines, so its rects are taller than one line.
      const split = await el.evaluate((node) => {
        const text = node.firstChild;
        if (text === null || text.nodeType !== Node.TEXT_NODE) return [];
        const content = text.textContent ?? "";
        const broken: string[] = [];
        for (const match of content.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(text, match.index ?? 0);
          range.setEnd(text, (match.index ?? 0) + match[0].length);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          if (lines.size > 1) broken.push(match[0]);
        }
        return broken;
      });
      expect(split, `row ${String(i + 1)}: words split across lines`).toEqual([]);
    }
  });
});
