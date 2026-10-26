// Rendered check of an Ask AI answer's Matches at 390/768/1440 (the three Playwright viewport
// projects) against the hosted app. The jsdom tests cover the card's parts; this file covers what a
// person sees: the address and the "near ..." distance do not overlap, nothing scrolls sideways,
// the card sits exactly where a filter-search result card sits (PM review 2026-10-26: "matching
// shall be shown with the same design regardless it comes from AI or filter"), and the List view
// lists the answer ("From your question") with a way back to the filter results.
//
// Cost: ONE real, paid `agent.ask` per viewport project (3 per run, under the 5/min/user limit),
// so this file runs in PW_PHASE=isolated with the other paid specs (playwright.config.ts).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { AUTH_STATE_PATH, requirePassword } from "../lib/auth.js";
import { expectNoHorizontalScroll, overlapArea, settledBox, type Box } from "../lib/layout.js";
import { LAYOUT_SEARCH_PATH } from "../lib/run-fixtures.js";

test.use({ storageState: AUTH_STATE_PATH });

// A golden query (reference/checks.md): answered with rows, each near a place centroid.
const QUESTION = "Which properties within 3 miles of Austin have roofs older than 20 years?";
const ASK_ROOT = '[data-panel="ask"]';
/** The server stops a turn at 23 s; allow the round trip on top. */
const ANSWER_TIMEOUT_MS = 40_000;
/** Sub-pixel rounding between two layouts of the same card. */
const SLACK = 2;

async function waitForCard(page: Page, list: Locator): Promise<Locator> {
  const card = list.locator("[data-result-row]").first();
  await expect(card).toBeAttached({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  return card;
}

async function cardBox(card: Locator): Promise<Box> {
  return settledBox(card);
}

test.describe("Ask AI matches render like search results", () => {
  test.beforeEach(() => {
    requirePassword();
  });

  test("Matches cards do not overlap, match a search card's geometry, and the List shows the answer", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // 1. A filter-search result card at the fixture pin (free): the reference geometry.
    await page.goto(LAYOUT_SEARCH_PATH);
    await expect(page.locator('[data-route="map"]')).toBeVisible();
    const searchCard = await waitForCard(page, page.getByRole("list", { name: "Results" }));
    const reference = await cardBox(searchCard);
    expect(reference.width, "the search card has a width").toBeGreaterThan(200);

    // 2. One real question, typed into the composer and sent.
    await page.goto("/?mode=ai");
    await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", "idle");
    await page.evaluate(() => document.fonts.ready);
    await page.getByLabel("Question").fill(QUESTION);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const root = page.locator(ASK_ROOT);
    await expect(root).toHaveAttribute("data-state", /^(?:answer|throttled)$/, {
      timeout: ANSWER_TIMEOUT_MS,
    });
    // A throttled turn is an honest outcome for the limit, but then there is nothing to measure.
    expect(await root.getAttribute("data-state"), "the question was answered").not.toBe(
      "throttled",
    );

    // 3. The Matches cards.
    // Below 1280 px the rows are the answer's second tab; from 1280 px they fill the results pane.
    const matchesTab = page.getByRole("tab", { name: /^Matches / });
    if (await matchesTab.isVisible()) await matchesTab.click();
    const matches = page.getByRole("list", { name: "Matches" });
    await expect(matches).toBeAttached({ timeout: 15_000 });
    const card = await waitForCard(page, matches);
    const box = await cardBox(card);
    expect(Math.abs(box.x - reference.x), "left edge equals a search card's").toBeLessThanOrEqual(
      SLACK,
    );
    expect(
      Math.abs(box.width - reference.width),
      "width equals a search card's",
    ).toBeLessThanOrEqual(SLACK);

    // The address (title) and the "near ..." distance text sit apart, on every card on screen.
    const near = matches.locator('[data-result-row] [title^="Distance from"]');
    await expect(near.first(), "the answer rows carry a 'near ...' text").toBeAttached();
    const cards = matches.locator("[data-result-row]");
    const count = Math.min(await cards.count(), 5);
    for (let i = 0; i < count; i += 1) {
      const one = cards.nth(i);
      await one.scrollIntoViewIfNeeded();
      const title = one.locator("h4 > span > span").first();
      const distance = one.locator('[title^="Distance from"]').first();
      if ((await distance.count()) === 0) continue;
      const t = await settledBox(title);
      const d = await settledBox(distance);
      expect(overlapArea(t, d), `card ${String(i + 1)}: address and distance overlap`).toBe(0);
      const c = await settledBox(one);
      expect(t.x + t.width, `card ${String(i + 1)}: address inside its card`).toBeLessThanOrEqual(
        c.x + c.width + SLACK,
      );
      expect(d.x + d.width, `card ${String(i + 1)}: distance inside its card`).toBeLessThanOrEqual(
        c.x + c.width + SLACK,
      );
    }
    await expectNoHorizontalScroll(page, "Ask answer with Matches");

    // 4. With the answer showing, the List view lists it, with a way back to the filter results.
    // The answer lives in the page, so the view is switched in place (a reload would drop it).
    await page.getByRole("group", { name: "View" }).getByRole("button", { name: "List" }).click();
    await expect(page).toHaveURL(/[?&]view=list(&|$)/);
    const list = page.locator('[data-candidate-list][data-list-source="answer"]');
    await expect(list).toBeVisible();
    await expect(list.locator("[data-list-source-label]")).toContainText("From your question");
    await expect(list.getByRole("button", { name: "Show filter results" })).toBeVisible();
    await expectNoHorizontalScroll(page, "List view of the answer");
  });
});
