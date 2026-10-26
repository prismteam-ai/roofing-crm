// B-09 T048 (US3, AC-5; agent-design.md smeargle §2/§4) + review round: responsive coverage for
// the Ask screen at 390/768/1440 (playwright.config.ts's three viewport projects) against
// RUNTIME_URL. Selectors come from `apps/web/src/routes/Ask/AskPanel.tsx`'s `data-state` values
// (`OUTCOME_STATE` is the single source of truth there).
//
// Cost and rate limit: every `agent.ask` is a real, paid model call, rate-limited to 5 asks/min
// per user (NFR-001) — and this file runs in PW_PHASE=isolated on one worker. So:
//  - the signed-in session is the saved one (tests/e2e/lib/auth.ts), not a sign-in per test;
//  - the layout / overflow / nav / token checks run on all three viewports in the idle state
//    (no ask), plus ONE ask on mobile-390 so the result layout is checked at the narrowest width;
//  - the answer-state tests run on desktop-1440 only (2 asks): 3 asks per run in total;
//  - a `throttled` result is an honest outcome, not a failure: when the limit is hit anyway the
//    test asserts the throttled banner and its live countdown (from `retryAfterSec`) instead.
//
// Seeded questions, zero compose cost (contracts/agent-api.md: the scope gate short-circuits
// after the plan call):
//  - an out-of-county ZIP (99999, mirroring AC-3/G6) → `out_of_scope`;
//  - an ungeocodable place name → `not_found`, or `low_confidence` when the resolver offers
//    candidate places (then rendered as buttons; not clicked, which would be a 4th ask).
// `paused` needs the real $3/day cap exhausted for the shared account; there is no test-only
// trigger, so it stays covered by apps/web/test/ask/Ask.test.tsx only.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { atlasTokenAudit, AUDITED_PROPERTIES } from "../lib/atlas-tokens.js";
import { AUTH_STATE_PATH, openSignedIn, requirePassword } from "../lib/auth.js";

// Signed in once by the `setup` project; this file tests the Ask screen, not sign-in.
test.use({ storageState: AUTH_STATE_PATH });

const ASK_ROOT = '[data-panel="ask"]';
const OUT_OF_SCOPE_QUESTION = "open roofing permits within five miles of 99999";
const NOT_FOUND_QUESTION = "open roofing permits within five miles of zzzzzznotaplacezzzzzz";
/** The server stops a turn at 23 s; allow the round trip on top. */
const ANSWER_TIMEOUT_MS = 30_000;

async function gotoAsk(page: Page): Promise<void> {
  await openSignedIn(page, "/?mode=ai");
  await expect(page.locator(ASK_ROOT)).toHaveAttribute("data-state", "idle");
  await page.evaluate(() => document.fonts.ready);
}

async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel("Question").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
}

/** Waits for a terminal state. Returns the state, accepting `throttled` as honest: in that case
 *  the banner must show the countdown and the Ask action must be held while it runs. */
async function settledState(page: Page, expected: RegExp): Promise<string> {
  const root = page.locator(ASK_ROOT);
  const pattern = new RegExp(`^(?:${expected.source}|throttled)$`);
  await expect(root).toHaveAttribute("data-state", pattern, { timeout: ANSWER_TIMEOUT_MS });
  const state = (await root.getAttribute("data-state")) ?? "";
  if (state === "throttled") {
    await expect(page.getByRole("alert")).toContainText(/Ask again in \d+ s|You can ask again now/);
  }
  return state;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

async function expectTokenAudit(page: Page): Promise<void> {
  const audit = await page.evaluate(atlasTokenAudit, AUDITED_PROPERTIES);
  expect(audit.checkedElements).toBeGreaterThan(0);
  expect(audit.violations, JSON.stringify(audit.violations, null, 2)).toEqual([]);
}

function onlyOn(testInfo: TestInfo, project: string, why: string): void {
  test.skip(testInfo.project.name !== project, why);
}

const ANSWER_STATES_ONCE =
  "real paid agent.ask calls under a 5/min/user limit: answer states run once (desktop-1440)";

test.describe("Responsive design: Ask screen", () => {
  test.beforeEach(async ({ page }) => {
    requirePassword();
    await gotoAsk(page);
  });

  // ---- all viewports, no ask -------------------------------------------------------------

  test("the idle screen renders with no horizontal overflow", async ({ page }) => {
    await expectNoHorizontalOverflow(page);
  });

  test("shows the roadmap sections in the surface this breakpoint owns (More sheet below 600px, nav rail from 600px)", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;
    const moreTrigger = page.getByRole("button", { name: "More", exact: true });
    const navRail = page.locator('[aria-label="Roadmap sections (not yet built)"]');
    if (isCompact) {
      await expect(moreTrigger).toBeVisible();
      await expect(navRail).toBeHidden();
    } else {
      await expect(moreTrigger).toBeHidden();
      await expect(navRail).toBeVisible();
    }
  });

  test("the primary nav switches from row (bottom bar) to column (left rail) layout at the rail breakpoint", async ({
    page,
  }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const isCompact = (viewport?.width ?? 0) < 600;
    const nav = page.locator('nav[aria-label="Primary"]');
    await expect(nav).toHaveCSS("flex-direction", isCompact ? "row" : "column");
  });

  test("the question input stays inside the viewport", async ({ page }) => {
    const viewport = page.viewportSize();
    const box = await page.getByLabel("Question").boundingBox();
    expect(box).not.toBeNull();
    if (box && viewport) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  });

  test("passes the Atlas design-token audit in the idle state", async ({ page }) => {
    await expectTokenAudit(page);
  });

  // ---- one ask at 390: the result layout at the narrowest width --------------------------

  test("390: an out-of-scope result fits the phone width and passes the token audit", async ({
    page,
  }, testInfo) => {
    onlyOn(testInfo, "mobile-390", "the one narrow-width ask; wider widths reuse desktop's asks");
    await ask(page, OUT_OF_SCOPE_QUESTION);
    await settledState(page, /out_of_scope/);
    await expectNoHorizontalOverflow(page);
    await expectTokenAudit(page);
  });

  // ---- desktop-1440 only: the answer states (2 asks) ---------------------------------------

  test("out_of_scope: working state shows progress, then the result heading takes focus", async ({
    page,
  }, testInfo) => {
    onlyOn(testInfo, "desktop-1440", ANSWER_STATES_ONCE);
    const root = page.locator(ASK_ROOT);
    await ask(page, OUT_OF_SCOPE_QUESTION);
    // `working` is transient; when caught, it shows the progress bar and keeps the question
    // readable (read-only, not disabled).
    if ((await root.getAttribute("data-state")) === "working") {
      await expect(page.getByRole("progressbar", { name: "Working" })).toBeVisible();
      await expect(page.getByLabel("Question")).toHaveValue(OUT_OF_SCOPE_QUESTION);
    }
    const state = await settledState(page, /out_of_scope/);
    const heading = page.locator("#ask-result-heading");
    await expect(heading).toBeFocused();
    // Scoped to the Ask panel: the map beside it has its own status chip (a second role=status).
    await expect(root.getByRole("status")).toHaveText(await heading.innerText());
    if (state === "out_of_scope") {
      await expect(page.getByText(/is outside the area this CRM covers/)).toBeVisible();
    } else {
      // Throttled has no model plan: "How I read this" must not be shown.
      await expect(page.getByText(/How I read this/)).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(page);
    await expectTokenAudit(page);
  });

  test("an ungeocodable place reaches not_found, or low_confidence with candidate buttons", async ({
    page,
  }, testInfo) => {
    onlyOn(testInfo, "desktop-1440", ANSWER_STATES_ONCE);
    await ask(page, NOT_FOUND_QUESTION);
    const state = await settledState(page, /not_found|low_confidence/);
    if (state === "not_found") {
      await expect(page.getByText(/couldn't find “/)).toBeVisible();
    }
    if (state === "low_confidence") {
      const places = page.getByRole("group", { name: "Places I know" });
      if ((await places.count()) > 0) {
        await expect(places.getByRole("button").first()).toBeVisible();
      }
    }
    await expectNoHorizontalOverflow(page);
  });
});
