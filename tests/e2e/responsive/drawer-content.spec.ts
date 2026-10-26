// The Map property drawer's content at 390/768/1440 on the hosted app: the drawer never scrolls
// sideways, the inline "Why this is a lead" section with its rules, the Property record and every
// permit card are present, the Missing data bullets wrap inside the drawer, and "Ask about it" is
// reachable. On desktop-1440 only, one paid `agent.ask`: "Ask about it" closes the drawer and the
// Ask panel answers (that is why this file runs in PW_PHASE=isolated, playwright.config.ts).
import { expect, test, type Locator } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import {
  expectInsideViewport,
  expectNoHorizontalScroll,
  MIN_TAP,
  settledBox,
} from "../lib/layout.js";
import { LEAD_FIXTURES } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

const SEL = LEAD_FIXTURES.openPermit.cid;
const drawerOf = (page: import("@playwright/test").Page): Locator =>
  page.locator('[role="dialog"][data-property-cid]');

test.describe("Property drawer content fits the screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await page.goto(`/?sel=${SEL}`);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    await expect(drawerOf(page)).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
  });

  test("no sideways overflow; the why section, rules, record, permits and missing bullets sit inside the drawer", async ({
    page,
  }) => {
    const drawer = drawerOf(page);
    const sheet = await settledBox(drawer);
    await expectNoHorizontalScroll(page, "drawer open");
    const overflow = await drawer.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(overflow.scrollWidth, "the drawer does not scroll sideways").toBeLessThanOrEqual(
      overflow.clientWidth,
    );

    // Inline "Why this is a lead": heading and the rule rows.
    const why = drawer.locator("[data-drawer-why]");
    await why.scrollIntoViewIfNeeded();
    await expect(why.getByRole("heading", { name: "Why this is a lead" })).toBeVisible();
    const rules = why.locator("[data-why-rule]");
    await expect(rules.first()).toBeVisible();
    for (let i = 0; i < (await rules.count()); i += 1) {
      const box = await settledBox(rules.nth(i));
      expect(box.x + box.width, `rule ${String(i + 1)} inside the drawer`).toBeLessThanOrEqual(
        sheet.x + sheet.width + 1,
      );
    }

    // Property record, and every permit card the fixture has (an open permit: at least one).
    const record = drawer.locator("[data-drawer-record]");
    await record.scrollIntoViewIfNeeded();
    await expect(record.getByRole("heading", { name: "Property record" })).toBeVisible();
    const permits = drawer.locator("[data-permit-cid]");
    expect(await permits.count(), "the open-permit fixture has permit cards").toBeGreaterThan(0);
    for (let i = 0; i < (await permits.count()); i += 1) {
      const card = permits.nth(i);
      await card.scrollIntoViewIfNeeded();
      await expect(card, `permit card ${String(i + 1)}`).toBeVisible();
      const box = await settledBox(card);
      expect(
        box.x + box.width,
        `permit card ${String(i + 1)} inside the drawer`,
      ).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
    }

    // Missing data bullets wrap inside the drawer width.
    const lists = drawer.getByRole("list", { name: "Missing data" });
    for (let i = 0; i < (await lists.count()); i += 1) {
      const items = lists.nth(i).getByRole("listitem");
      for (let j = 0; j < (await items.count()); j += 1) {
        const item = items.nth(j);
        await item.scrollIntoViewIfNeeded();
        const box = await settledBox(item);
        expect(
          box.x + box.width,
          `missing bullet ${String(i + 1)}.${String(j + 1)}`,
        ).toBeLessThanOrEqual(sheet.x + sheet.width + 1);
        expect(
          box.x,
          `missing bullet ${String(i + 1)}.${String(j + 1)} left edge`,
        ).toBeGreaterThanOrEqual(sheet.x - 1);
      }
    }

    // "Ask about it" is reachable.
    const ask = drawer.getByRole("link", { name: "Ask about it" });
    await ask.scrollIntoViewIfNeeded();
    const askBox = await settledBox(ask);
    expectInsideViewport(askBox, page, "Ask about it");
    expect(askBox.height, "Ask about it height").toBeGreaterThanOrEqual(MIN_TAP);
  });

  test("Ask about it closes the drawer and the Ask panel answers (one paid ask, desktop-1440 only)", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440", "one real, paid ask in this file");
    test.setTimeout(90_000);
    await drawerOf(page).getByRole("link", { name: "Ask about it" }).click();
    await expect(page).not.toHaveURL(/[?&]sel=/);
    await expect(drawerOf(page)).toBeHidden();
    const root = page.locator('[data-panel="ask"]');
    // Any terminal state is an answer to the question (a throttled turn is an honest outcome too).
    await expect(root).toHaveAttribute(
      "data-state",
      /^(answer|no_results|low_confidence|throttled|timed_out)$/,
      { timeout: 40_000 },
    );
  });
});
